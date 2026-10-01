const assert = require("assert");
const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const customerControllerPath = require.resolve(
  "../controllers/customer/customer.warranty",
);
const adminControllerPath = require.resolve(
  "../controllers/admin/warrantyController",
);

const dbPath = require.resolve("../config/db");
const signedUrlPath = require.resolve("../utils/signedUrl");
const notificationHelperPath = require.resolve("../utils/notificationHelper");
const auditLogPath = require.resolve("../middleware/auditLog");
const philippineTimePath = require.resolve("../utils/philippineTime");
const validatorsPath = require.resolve("../utils/validators");
const warrantyInventoryServicePath = require.resolve(
  "../services/warrantyInventoryService",
);

const SECRET = "ER_NO_SUCH_TABLE: SECRET_WARRANTY_INTERNAL";
const originals = new Map();

function remember(modulePath) {
  if (!originals.has(modulePath)) {
    originals.set(modulePath, require.cache[modulePath]);
  }
}

function install(modulePath, exportsValue) {
  remember(modulePath);
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
  };
}

function restoreAll() {
  for (const [modulePath, entry] of originals.entries()) {
    if (entry) require.cache[modulePath] = entry;
    else delete require.cache[modulePath];
  }
}

function internalError() {
  const error = new Error(SECRET);
  error.code = "ER_NO_SUCH_TABLE";
  return error;
}

function businessError(message, status, details = null) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function parseStrictPositiveInt(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return null;
  const number = Number(str);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function assertSafeUnexpected500(res, label) {
  assert.equal(res.statusCode, 500, `${label}: expected HTTP 500`);
  assert.equal(
    typeof res.body?.message,
    "string",
    `${label}: expected a safe public message`,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(res.body || {}, "error"),
    false,
    `${label}: internal error field must not be returned`,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(res.body || {}, "details"),
    false,
    `${label}: unexpected 500 details must not be returned`,
  );
  assert.equal(
    JSON.stringify(res.body || {}).includes(SECRET),
    false,
    `${label}: internal error text leaked to the client`,
  );
}

function logContainsSecret(logs) {
  return logs.some((args) =>
    args.some((value) => {
      if (value instanceof Error) return value.message.includes(SECRET);
      return String(value || "").includes(SECRET);
    }),
  );
}

async function run() {
  const customerSource = fs.readFileSync(customerControllerPath, "utf8");
  const adminSource = fs.readFileSync(adminControllerPath, "utf8");

  assert.doesNotMatch(
    customerSource,
    /error\s*:\s*err\.message/,
    "Customer warranty controller must not serialize err.message.",
  );
  assert.doesNotMatch(
    adminSource,
    /error\s*:\s*err\.message/,
    "Admin warranty controller must not serialize err.message.",
  );

  const dbStub = {
    query: async () => {
      throw internalError();
    },
    getConnection: async () => {
      throw internalError();
    },
  };

  let resolutionMode = "unexpected";
  let fulfillmentMode = "unexpected";

  const warrantyInventoryServiceStub = {
    getResolutionOptions: async () => {
      if (resolutionMode === "business") {
        throw businessError(
          "This legacy claim is not linked to an exact order item and cannot be fulfilled safely.",
          409,
          { claim_id: 77 },
        );
      }
      throw internalError();
    },
    fulfillClaimWithInventory: async () => {
      if (fulfillmentMode === "business") {
        throw businessError(
          "Insufficient available stock for Oak Board.",
          409,
          { material_id: 10, available: 2, requested: 3 },
        );
      }
      throw internalError();
    },
  };

  install(dbPath, dbStub);
  install(signedUrlPath, { signUploadPath: (value) => value });
  install(notificationHelperPath, {
    createNotificationSafe: async () => true,
  });
  install(auditLogPath, {
    writeAuditLogSafe: async () => true,
  });
  install(philippineTimePath, {
    getPhilippineDateKey: () => "2026-10-01",
    getPhilippineDateBoundsUtc: () => ({
      startUtc: new Date("2026-10-01T00:00:00.000Z"),
      nextStartUtc: new Date("2026-10-02T00:00:00.000Z"),
    }),
  });
  install(validatorsPath, { parseStrictPositiveInt });
  install(warrantyInventoryServicePath, warrantyInventoryServiceStub);

  remember(customerControllerPath);
  remember(adminControllerPath);
  delete require.cache[customerControllerPath];
  delete require.cache[adminControllerPath];

  const customerController = require(customerControllerPath);
  const adminController = require(adminControllerPath);

  const originalConsoleError = console.error;
  let logs = [];
  console.error = (...args) => logs.push(args);

  try {
    const customerCases = [
      {
        label: "customer eligible orders",
        invoke: (res) =>
          customerController.getEligibleOrders({ user: { id: 17 } }, res),
      },
      {
        label: "customer claim list",
        invoke: (res) => customerController.getClaims({ user: { id: 17 } }, res),
      },
      {
        label: "customer submit claim",
        invoke: (res) =>
          customerController.submitClaim(
            {
              body: {
                order_id: "100",
                order_item_id: "200",
                claim_quantity: "1",
                description: "Visible defect.",
              },
              files: {
                photo: [{ filename: "defect.jpg" }],
                proof: [{ filename: "receipt.pdf" }],
              },
              user: { id: 17, name: "Warranty Test Customer" },
              ip: "127.0.0.1",
            },
            res,
          ),
      },
      {
        label: "customer cancel claim",
        invoke: (res) =>
          customerController.cancelClaim(
            { params: { id: "1" }, user: { id: 17 } },
            res,
          ),
      },
    ];

    for (const testCase of customerCases) {
      logs = [];
      const res = makeRes();
      await testCase.invoke(res);
      assertSafeUnexpected500(res, testCase.label);
      assert.equal(
        logContainsSecret(logs),
        true,
        `${testCase.label}: detailed error must remain in server logs`,
      );
    }

    const adminDbCases = [
      {
        label: "admin claim list",
        invoke: (res) => adminController.getClaims({ query: {} }, res),
      },
      {
        label: "admin decision",
        invoke: (res) =>
          adminController.decideClaim(
            {
              params: { id: "1" },
              body: { decision: "approved", admin_note: "" },
              user: { id: 1 },
            },
            res,
          ),
      },
    ];

    for (const testCase of adminDbCases) {
      logs = [];
      const res = makeRes();
      await testCase.invoke(res);
      assertSafeUnexpected500(res, testCase.label);
      assert.equal(
        logContainsSecret(logs),
        true,
        `${testCase.label}: detailed error must remain in server logs`,
      );
    }

    logs = [];
    resolutionMode = "unexpected";
    {
      const res = makeRes();
      await adminController.getResolutionOptions(
        { params: { id: "1" } },
        res,
      );
      assertSafeUnexpected500(res, "admin resolution options");
      assert.equal(
        logContainsSecret(logs),
        true,
        "admin resolution options: unexpected error must remain in server logs",
      );
    }

    logs = [];
    fulfillmentMode = "unexpected";
    {
      const res = makeRes();
      await adminController.fulfillClaim(
        {
          params: { id: "1" },
          body: { resolution_type: "repair" },
          file: { path: "uploads/warranty-replacements/test.jpg" },
          user: { id: 1 },
        },
        res,
      );
      assertSafeUnexpected500(res, "admin fulfillment");
      assert.equal(
        logContainsSecret(logs),
        true,
        "admin fulfillment: unexpected error must remain in server logs",
      );
    }

    resolutionMode = "business";
    {
      const res = makeRes();
      await adminController.getResolutionOptions(
        { params: { id: "77" } },
        res,
      );
      assert.equal(res.statusCode, 409);
      assert.match(res.body?.message || "", /legacy claim/i);
      assert.deepEqual(res.body?.details, { claim_id: 77 });
    }

    fulfillmentMode = "business";
    {
      const res = makeRes();
      await adminController.fulfillClaim(
        {
          params: { id: "77" },
          body: { resolution_type: "repair" },
          file: { path: "uploads/warranty-replacements/test.jpg" },
          user: { id: 1 },
        },
        res,
      );
      assert.equal(res.statusCode, 409);
      assert.match(res.body?.message || "", /insufficient available stock/i);
      assert.deepEqual(res.body?.details, {
        material_id: 10,
        available: 2,
        requested: 3,
      });
    }

    console.log("PASS: Warranty internal error exposure checks passed.");
  } finally {
    console.error = originalConsoleError;
  }
}

run()
  .catch((error) => {
    console.error("FAIL: Warranty internal error exposure checks failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    restoreAll();
  });
