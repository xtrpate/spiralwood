const assert = require("assert");
const fs = require("fs");
const path = require("path");

const servicePath = require.resolve("../services/warrantyInventoryService");
const dbPath = require.resolve("../config/db");
const modalPath = path.join(
  __dirname,
  "../../frontend/src/pages/warranty/WarrantyResolutionModal.jsx",
);

const serviceSource = fs.readFileSync(servicePath, "utf8");
const modalSource = fs.readFileSync(modalPath, "utf8");

assert.match(serviceSource, /parsePositiveMaterialQuantity/);
assert.match(serviceSource, /Material quantity can have up to 2 decimal places/);
assert.match(serviceSource, /normalizeResolutionNotes/);
assert.match(serviceSource, /MAX_WARRANTY_RESOLUTION_NOTES_LENGTH = 4000/);
assert.match(serviceSource, /getValidatedClaimQuantity/);
assert.match(serviceSource, /RETURN_DISPOSITIONS\.has\(disposition\)/);
assert.doesNotMatch(
  serviceSource,
  /String\(resolutionNotes \|\| ""\)\.trim\(\)\.slice\(0,\s*4000\)/,
);

assert.match(
  modalSource,
  /maxLength=\{MAX_WARRANTY_RESOLUTION_NOTES_LENGTH\}/,
);
assert.match(
  modalSource,
  /readyMade && nextResolution === "full_product_replacement"[\s\S]*setUsage\(\{\}\)/,
);
assert.match(
  modalSource,
  /readyMade && resolutionType === "full_product_replacement"[\s\S]*\? \[\][\s\S]*: selectedMaterials/,
);
assert.match(modalSource, /const hasSelectedQuantity =/);
assert.match(modalSource, /matchesSearch \|\| hasSelectedQuantity/);
assert.match(modalSource, /\[options, search, usage\]/);
assert.match(
  modalSource,
  /min=\{\["meter", "kg", "liter", "gallon"\][\s\S]*\? "0\.01" : "1"\}/,
);

const originalDbCache = require.cache[dbPath];
const originalServiceCache = require.cache[servicePath];

let currentConnection = null;
let getConnectionCalls = 0;

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    getConnection: async () => {
      getConnectionCalls += 1;
      if (!currentConnection) {
        throw new Error("No test connection configured.");
      }
      return currentConnection;
    },
    query: async () => {
      throw new Error("Unexpected pool.query in W6B test.");
    },
  },
};
delete require.cache[servicePath];

const service = require(servicePath);

const baseClaim = () => ({
  id: 5,
  order_id: 9,
  order_item_id: 10,
  customer_id: 20,
  product_name: "Desk",
  claim_quantity: 1,
  status: "approved",
  replacement_receipt: null,
  order_number: "SWS-TEST",
  order_type: "custom",
  product_id: null,
  order_item_name: "Desk",
  ordered_quantity: 1,
  product_catalog_name: null,
  product_type: null,
  product_total_stock: 0,
  product_reorder_point: 0,
  product_is_active: null,
  display_stock: 0,
});

const baseMaterial = () => ({
  id: 10,
  name: "Edge Banding",
  unit: "kg",
  quantity: 10,
  reorder_point: 2,
  safety_stock: 1,
  is_active: 1,
});

function makeConnection({
  claimOverrides = {},
  materialOverrides = {},
  materialMissing = false,
  reservations = [],
  commitFails = false,
} = {}) {
  const events = [];
  const updates = [];
  const movementQuantities = [];
  const claim = { ...baseClaim(), ...claimOverrides };
  const material = { ...baseMaterial(), ...materialOverrides };

  const conn = {
    events,
    updates,
    movementQuantities,
    async beginTransaction() {
      events.push("begin");
    },
    async query(sql, params = []) {
      const text = String(sql || "");

      if (text.includes("FROM warranties w")) {
        return [[claim]];
      }

      if (text.includes("FROM raw_materials")) {
        return [materialMissing ? [] : [material]];
      }

      if (text.includes("FROM blueprint_material_reservations")) {
        return [reservations];
      }

      if (text.includes("UPDATE raw_materials SET quantity")) {
        updates.push({
          kind: "raw_material",
          quantity: params[0],
          status: params[1],
          material_id: params[2],
        });
        return [{ affectedRows: 1 }];
      }

      if (text.includes("INSERT INTO stock_movements")) {
        movementQuantities.push(params[1]);
        return [{ insertId: 701 }];
      }

      if (text.includes("INSERT INTO warranty_inventory_movements")) {
        return [{ insertId: 801 }];
      }

      if (text.includes("UPDATE warranties")) {
        updates.push({
          kind: "warranty",
          params,
        });
        return [{ affectedRows: 1 }];
      }

      if (text.includes("INSERT INTO ready_made_display_stock")) {
        return [{ affectedRows: 1 }];
      }

      if (text.includes("FROM products p")) {
        return [[{
          id: 1,
          name: "Ready Desk",
          type: "standard",
          total_stock: 10,
          reorder_point: 2,
          is_active: 1,
          display_stock: 3,
        }]];
      }

      if (text.includes("UPDATE products SET stock")) {
        updates.push({ kind: "product", params });
        return [{ affectedRows: 1 }];
      }

      if (text.includes("UPDATE ready_made_display_stock")) {
        updates.push({ kind: "display", params });
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected W6B query: ${text}`);
    },
    async commit() {
      events.push("commit");
      if (commitFails) throw new Error("simulated W6B commit transport failure");
    },
    async rollback() {
      events.push("rollback");
    },
    release() {
      events.push("release");
    },
  };

  return conn;
}

const makeArgs = (overrides = {}) => ({
  claimId: 5,
  actorId: 1,
  receiptPath: "uploads/warranty-replacements/test-proof.jpg",
  resolutionType: "repair",
  resolutionNotes: "",
  replacementSource: "",
  returnDisposition: "not_returned",
  materials: "[]",
  ...overrides,
});

async function expectRejected(args, {
  status = 400,
  message,
  connection = null,
  expectedConnectionCalls,
} = {}) {
  currentConnection = connection;
  getConnectionCalls = 0;

  let error = null;
  try {
    await service.fulfillClaimWithInventory(args);
  } catch (caught) {
    error = caught;
  }

  assert(error, "Expected warranty fulfillment to reject.");
  assert.equal(error.status, status);
  if (message) assert.match(error.message, message);
  if (expectedConnectionCalls !== undefined) {
    assert.equal(getConnectionCalls, expectedConnectionCalls);
  }
  return error;
}

async function run() {
  const invalidPreTransaction = [
    {
      materials: JSON.stringify([{ material_id: 10, quantity: 0 }]),
      message: /greater than 0/i,
    },
    {
      materials: JSON.stringify([{ material_id: 10, quantity: -1 }]),
      message: /greater than 0/i,
    },
    {
      materials: JSON.stringify([{ material_id: 10, quantity: 0.001 }]),
      message: /up to 2 decimal places/i,
    },
    {
      materials: JSON.stringify([{ material_id: 10, quantity: 1.234 }]),
      message: /up to 2 decimal places/i,
    },
    {
      materials: JSON.stringify([{ material_id: 10, quantity: true }]),
      message: /must be a number/i,
    },
    {
      materials: JSON.stringify([{ material_id: 10, quantity: null }]),
      message: /must be a number/i,
    },
    {
      materials: JSON.stringify([{ material_id: 10, quantity: {} }]),
      message: /must be a number/i,
    },
    {
      materials: JSON.stringify([{ material_id: 10, quantity: "1e2" }]),
      message: /up to 2 decimal places/i,
    },
    {
      materials: JSON.stringify([
        { material_id: 10, quantity: 1 },
        { material_id: 10, quantity: 1 },
      ]),
      message: /cannot appear twice/i,
    },
  ];

  for (const scenario of invalidPreTransaction) {
    await expectRejected(
      makeArgs({ materials: scenario.materials }),
      {
        status: 400,
        message: scenario.message,
        expectedConnectionCalls: 0,
      },
    );
  }

  await expectRejected(
    makeArgs({ resolutionNotes: { invalid: true } }),
    {
      status: 400,
      message: /must be text/i,
      expectedConnectionCalls: 0,
    },
  );

  await expectRejected(
    makeArgs({ resolutionNotes: "x".repeat(4001) }),
    {
      status: 400,
      message: /must not exceed 4000/i,
      expectedConnectionCalls: 0,
    },
  );

  await expectRejected(
    makeArgs({
      resolutionType: "full_product_replacement",
      returnDisposition: "not_a_real_disposition",
      materials: JSON.stringify([{ material_id: 10, quantity: 1 }]),
    }),
    {
      status: 400,
      message: /valid returned-item disposition/i,
      expectedConnectionCalls: 0,
    },
  );

  await expectRejected(
    makeArgs({
      resolutionType: "full_product_replacement",
      returnDisposition: ["not_returned"],
      materials: JSON.stringify([{ material_id: 10, quantity: 1 }]),
    }),
    {
      status: 400,
      message: /valid returned-item disposition/i,
      expectedConnectionCalls: 0,
    },
  );

  let conn = makeConnection({
    claimOverrides: { claim_quantity: 0, ordered_quantity: 1 },
  });
  await expectRejected(
    makeArgs(),
    {
      status: 409,
      message: /claim quantity is invalid/i,
      connection: conn,
      expectedConnectionCalls: 1,
    },
  );
  assert(conn.events.includes("rollback"));

  conn = makeConnection({
    claimOverrides: { claim_quantity: 2, ordered_quantity: 1 },
  });
  await expectRejected(
    makeArgs(),
    {
      status: 409,
      message: /claim quantity is invalid/i,
      connection: conn,
      expectedConnectionCalls: 1,
    },
  );
  assert(conn.events.includes("rollback"));

  conn = makeConnection({
    materialOverrides: { unit: "pcs", quantity: 10 },
  });
  await expectRejected(
    makeArgs({
      materials: JSON.stringify([{ material_id: 10, quantity: 1.5 }]),
    }),
    {
      status: 400,
      message: /whole number/i,
      connection: conn,
      expectedConnectionCalls: 1,
    },
  );
  assert(conn.events.includes("rollback"));
  assert.equal(conn.updates.some((item) => item.kind === "raw_material"), false);

  await expectRejected(
    makeArgs({
      materials: JSON.stringify([{ material_id: 10, quantity: 1.004 }]),
    }),
    {
      status: 400,
      message: /up to 2 decimal places/i,
      expectedConnectionCalls: 0,
    },
  );

  conn = makeConnection({ materialMissing: true });
  await expectRejected(
    makeArgs({
      materials: JSON.stringify([{ material_id: 10, quantity: 1 }]),
    }),
    {
      status: 409,
      message: /no longer exists/i,
      connection: conn,
      expectedConnectionCalls: 1,
    },
  );
  assert(conn.events.includes("rollback"));

  conn = makeConnection({
    materialOverrides: { is_active: 0 },
  });
  await expectRejected(
    makeArgs({
      materials: JSON.stringify([{ material_id: 10, quantity: 1 }]),
    }),
    {
      status: 409,
      message: /archived or unavailable/i,
      connection: conn,
      expectedConnectionCalls: 1,
    },
  );
  assert(conn.events.includes("rollback"));

  conn = makeConnection({
    materialOverrides: { quantity: 1 },
    reservations: [{ material_id: 10, reserved_quantity: 0.75 }],
  });
  await expectRejected(
    makeArgs({
      materials: JSON.stringify([{ material_id: 10, quantity: 0.5 }]),
    }),
    {
      status: 409,
      message: /insufficient available stock/i,
      connection: conn,
      expectedConnectionCalls: 1,
    },
  );
  assert(conn.events.includes("rollback"));

  conn = makeConnection();
  currentConnection = conn;
  getConnectionCalls = 0;
  let result = await service.fulfillClaimWithInventory(
    makeArgs({
      materials: JSON.stringify([{ material_id: 10, quantity: 1.23 }]),
    }),
  );
  assert.equal(result.resolution_type, "repair");
  assert.equal(getConnectionCalls, 1);
  assert.equal(conn.events.includes("commit"), true);
  assert.equal(conn.events.includes("rollback"), false);
  assert.equal(
    conn.updates.find((item) => item.kind === "raw_material")?.quantity,
    8.77,
  );
  assert.equal(conn.movementQuantities[0], 1.23);

  conn = makeConnection({
    materialOverrides: { unit: "pcs", quantity: 10 },
  });
  currentConnection = conn;
  result = await service.fulfillClaimWithInventory(
    makeArgs({
      materials: JSON.stringify([{ material_id: 10, quantity: 2 }]),
    }),
  );
  assert.equal(result.resolution_type, "repair");
  assert.equal(conn.events.includes("commit"), true);
  assert.equal(
    conn.updates.find((item) => item.kind === "raw_material")?.quantity,
    8,
  );

  conn = makeConnection();
  currentConnection = conn;
  const exactNotes = "n".repeat(4000);
  result = await service.fulfillClaimWithInventory(
    makeArgs({ resolutionNotes: exactNotes }),
  );
  assert.equal(result.resolution_notes.length, 4000);
  assert.equal(conn.events.includes("commit"), true);

  conn = makeConnection();
  await expectRejected(
    makeArgs({
      resolutionType: "full_product_replacement",
      materials: "[]",
    }),
    {
      status: 400,
      message: /requires the raw materials actually used/i,
      connection: conn,
      expectedConnectionCalls: 1,
    },
  );
  assert(conn.events.includes("rollback"));

  conn = makeConnection({
    claimOverrides: {
      order_type: "standard",
      product_id: 1,
      product_type: "standard",
      product_total_stock: 10,
      display_stock: 3,
    },
  });
  await expectRejected(
    makeArgs({
      resolutionType: "full_product_replacement",
      replacementSource: "warehouse",
      materials: JSON.stringify([{ material_id: 10, quantity: 1 }]),
    }),
    {
      status: 400,
      message: /exact finished product, not raw-material deductions/i,
      connection: conn,
      expectedConnectionCalls: 1,
    },
  );
  assert(conn.events.includes("rollback"));

  console.log("PASS: Warranty fulfillment validation integrity checks passed.");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (originalDbCache) require.cache[dbPath] = originalDbCache;
    else delete require.cache[dbPath];

    if (originalServiceCache) require.cache[servicePath] = originalServiceCache;
    else delete require.cache[servicePath];
  });
