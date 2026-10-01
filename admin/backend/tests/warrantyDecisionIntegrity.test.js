"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const controllerFile = path.join(
  backendRoot,
  "controllers/admin/warrantyController.js",
);
const frontendFile = path.resolve(
  backendRoot,
  "../frontend/src/pages/warranty/WarrantyPage.jsx",
);

const controllerSource = fs.readFileSync(controllerFile, "utf8");
const frontendSource = fs.readFileSync(frontendFile, "utf8");

assert.match(
  controllerSource,
  /parseStrictPositiveInt\(req\.params\.id\)/,
  "Warranty decisions must strictly parse the claim ID.",
);

assert.match(
  controllerSource,
  /const MAX_WARRANTY_ADMIN_NOTE_LENGTH = 1000;/,
  "Warranty admin notes must have an explicit backend limit.",
);

assert.match(
  controllerSource,
  /WHERE id = \?\s+AND status = 'pending'/,
  "Warranty decision update must be conditional on pending status.",
);

assert.match(
  controllerSource,
  /Number\(decisionUpdate\?\.affectedRows \|\| 0\) !== 1/,
  "Warranty decision update must verify exactly one row changed.",
);

assert.match(
  frontendSource,
  /const \[decisionBusy, setDecisionBusy\] = useState\(false\);/,
  "Warranty decision UI must track request busy state.",
);

assert.match(
  frontendSource,
  /maxLength=\{1000\}/,
  "Warranty decision textarea must match the backend note limit.",
);

assert.match(
  frontendSource,
  /const status = Number\(err\?\.response\?\.status\);/,
  "Warranty decision UI must normalize the response status once.",
);

assert.match(
  frontendSource,
  /if \(status !== 409\) \{\s*toast\.error\(message\);\s*\}/,
  "Warranty decision UI must not duplicate the API interceptor's stale 409 toast.",
);

assert.match(
  frontendSource,
  /if \(status === 409\)/,
  "Warranty decision UI must refresh after a stale decision conflict.",
);

assert.match(
  frontendSource,
  /disabled=\{busy\}/,
  "Warranty decision controls must be disabled while saving.",
);

const dbPath = require.resolve("../config/db");
const signedUrlPath = require.resolve("../utils/signedUrl");
const notificationPath = require.resolve("../utils/notificationHelper");
const inventoryServicePath = require.resolve("../services/warrantyInventoryService");
const validatorsPath = require.resolve("../utils/validators");
const philippineTimePath = require.resolve("../utils/philippineTime");
const controllerPath = require.resolve("../controllers/admin/warrantyController");

const mockedPaths = [
  dbPath,
  signedUrlPath,
  notificationPath,
  inventoryServicePath,
  validatorsPath,
  philippineTimePath,
  controllerPath,
];

const originals = new Map(
  mockedPaths.map((modulePath) => [modulePath, require.cache[modulePath]]),
);

function install(modulePath, exportsValue) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
}

function restore() {
  for (const [modulePath, cached] of originals) {
    delete require.cache[modulePath];
    if (cached) require.cache[modulePath] = cached;
  }
}

function parseStrictPositiveInt(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    },
  };
}

const baseClaim = {
  id: 25,
  status: "pending",
  customer_id: 17,
  order_id: 91,
  product_name: "Test Warranty Desk",
  order_number: "SWS-W2-0091",
};

let scenario = "approval";
let queryCalls = [];
let notifications = [];

const mockDb = {
  async query(sql, params = []) {
    const text = String(sql);
    queryCalls.push({ sql: text, params: [...params] });

    if (
      text.includes("SELECT w.id") &&
      text.includes("FROM warranties w") &&
      text.includes("WHERE w.id = ?")
    ) {
      if (scenario === "missing") return [[]];
      if (scenario === "already_approved") {
        return [[{ ...baseClaim, status: "approved" }]];
      }
      return [[{ ...baseClaim }]];
    }

    if (
      text.includes("UPDATE warranties") &&
      text.includes("AND status = 'pending'")
    ) {
      if (scenario === "race") {
        return [{ affectedRows: 0 }];
      }

      return [{ affectedRows: 1 }];
    }

    if (
      text.includes("SELECT status") &&
      text.includes("FROM warranties") &&
      text.includes("WHERE id = ?")
    ) {
      return [[{ status: "approved" }]];
    }

    throw new Error(`Unexpected W2 query (${scenario}): ${text}`);
  },
};

async function runDecision(controller, {
  id = "25",
  decision = "approved",
  admin_note = "",
} = {}) {
  const req = {
    params: { id },
    body: { decision, admin_note },
    user: { id: 1 },
  };
  const res = makeRes();

  await controller.decideClaim(req, res);
  return { req, res };
}

async function run() {
  install(dbPath, mockDb);
  install(signedUrlPath, { signUploadPath: (value) => value });
  install(notificationPath, {
    createNotificationSafe: async (_db, payload) => {
      notifications.push(payload);
      return true;
    },
  });
  install(inventoryServicePath, {
    getResolutionOptions: async () => ({}),
    fulfillClaimWithInventory: async () => ({}),
  });
  install(validatorsPath, { parseStrictPositiveInt });
  install(philippineTimePath, {
    getPhilippineDateBoundsUtc: () => ({
      startUtc: "2026-10-01 00:00:00",
      nextStartUtc: "2026-10-02 00:00:00",
    }),
    getPhilippineDateKey: () => "2026-10-01",
  });

  delete require.cache[controllerPath];
  const controller = require("../controllers/admin/warrantyController");

  for (const invalidId of ["12abc", "1.5", "1e2", "0", "-1", ""]) {
    scenario = "approval";
    queryCalls = [];
    notifications = [];

    const { req, res } = await runDecision(controller, { id: invalidId });

    assert.equal(res.statusCode, 400, `ID ${invalidId} must be rejected.`);
    assert.equal(queryCalls.length, 0);
    assert.equal(notifications.length, 0);
    assert.equal(req.auditRecord, undefined);
  }

  queryCalls = [];
  notifications = [];
  let req = {
    params: { id: "25" },
    body: { decision: ["approved"], admin_note: "" },
  };
  let res = makeRes();
  await controller.decideClaim(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queryCalls.length, 0);

  queryCalls = [];
  notifications = [];
  req = {
    params: { id: "25" },
    body: { decision: "approved", admin_note: { text: "bad" } },
  };
  res = makeRes();
  await controller.decideClaim(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /must be text/i);
  assert.equal(queryCalls.length, 0);

  queryCalls = [];
  notifications = [];
  ({ req, res } = await runDecision(controller, {
    decision: "approved",
    admin_note: "x".repeat(1001),
  }));
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /1000 characters or fewer/i);
  assert.equal(queryCalls.length, 0);

  queryCalls = [];
  notifications = [];
  ({ req, res } = await runDecision(controller, {
    decision: "rejected",
    admin_note: "   ",
  }));
  assert.equal(res.statusCode, 400);
  assert.match(res.body?.message || "", /rejection reason/i);
  assert.equal(queryCalls.length, 0);

  scenario = "approval";
  queryCalls = [];
  notifications = [];
  ({ req, res } = await runDecision(controller, {
    decision: "approved",
    admin_note: "Approved after evidence review.",
  }));

  assert.equal(res.statusCode, 200);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, "Warranty Claim Approved");
  assert.deepEqual(req.auditRecord, {
    id: 25,
    old: { status: "pending" },
    new: { status: "approved", has_admin_note: true },
  });

  const approvalUpdate = queryCalls.find((call) =>
    call.sql.includes("UPDATE warranties"),
  );
  assert.ok(approvalUpdate);
  assert.match(approvalUpdate.sql, /AND status = 'pending'/);
  assert.deepEqual(approvalUpdate.params, [
    "approved",
    "Approved after evidence review.",
    25,
  ]);

  scenario = "rejection";
  queryCalls = [];
  notifications = [];
  ({ req, res } = await runDecision(controller, {
    decision: "rejected",
    admin_note: "Damage is outside the documented warranty coverage.",
  }));

  assert.equal(res.statusCode, 200);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, "Warranty Claim Not Approved");
  assert.match(
    notifications[0].message,
    /outside the documented warranty coverage/,
  );
  assert.deepEqual(req.auditRecord, {
    id: 25,
    old: { status: "pending" },
    new: { status: "rejected", has_admin_note: true },
  });

  scenario = "already_approved";
  queryCalls = [];
  notifications = [];
  ({ req, res } = await runDecision(controller, {
    decision: "rejected",
    admin_note: "Stale reviewer decision.",
  }));

  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.current_status, "approved");
  assert.equal(notifications.length, 0);
  assert.equal(req.auditRecord, undefined);
  assert.equal(
    queryCalls.some((call) => call.sql.includes("UPDATE warranties")),
    false,
  );

  scenario = "race";
  queryCalls = [];
  notifications = [];
  ({ req, res } = await runDecision(controller, {
    decision: "rejected",
    admin_note: "Second concurrent reviewer.",
  }));

  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.current_status, "approved");
  assert.equal(notifications.length, 0);
  assert.equal(req.auditRecord, undefined);

  const raceUpdate = queryCalls.find((call) =>
    call.sql.includes("UPDATE warranties"),
  );
  assert.ok(raceUpdate, "Race scenario must reach the conditional update.");
  assert.match(raceUpdate.sql, /AND status = 'pending'/);
  assert.equal(
    queryCalls.some(
      (call) =>
        call.sql.includes("SELECT status") &&
        call.sql.includes("FROM warranties"),
    ),
    true,
    "Race conflict must reload the latest status.",
  );

  console.log("PASS: Warranty decision integrity checks passed.");
}

run()
  .catch((error) => {
    console.error("FAIL: Warranty decision integrity checks failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);