"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const consumptionSource = read(
  "admin/backend/services/blueprintMaterialConsumptionService.js",
);
const orderControllerSource = read(
  "admin/backend/controllers/admin/orderController.js",
);
const orderDetailSource = read(
  "admin/frontend/src/pages/orders/OrderDetailPage.jsx",
);
const tasksPageSource = read(
  "admin/frontend/src/pages/tasks/TasksPage.jsx",
);

assert.match(
  consumptionSource,
  /ensureBlueprintMaterialReservations/,
  "Production consumption must reconcile reservations from the approved estimation.",
);
assert.match(
  consumptionSource,
  /reservationReconciliation\.reason === "NO_INVENTORY_MATERIALS"/,
  "A blueprint estimation with no inventory-tracked material must be an explicit valid production case.",
);
assert.match(
  consumptionSource,
  /BLUEPRINT_DOWN_PAYMENT_NOT_REACHED/,
  "Production reconciliation must keep the verified 30% gate.",
);
assert.match(
  consumptionSource,
  /Production materials could not be reconciled to reservation rows/,
  "Zero reservations after reconciliation must remain an integrity failure, not a silent bypass.",
);

const productionConsumptionCalls =
  orderControllerSource.match(/consumeBlueprintMaterialsForProduction\(/g) || [];
assert.ok(
  productionConsumptionCalls.length >= 2,
  "Both manual status-to-production and production-staff assignment must use the same centralized material-consumption service.",
);

assert.match(
  orderDetailSource,
  /api\.patch\(\s*`\/orders\/\$\{id\}\/status`,\s*\{\s*status:\s*nextStatus\s*\},\s*\{\s*suppressGlobalErrorToast:\s*true\s*\}/,
  "Order status failures must suppress the shared toast because the page already renders the server message locally.",
);
assert.match(
  tasksPageSource,
  /api\.patch\(\s*`\/orders\/\$\{productionOrderId\}\/assign-staff`,\s*payload,\s*\{\s*suppressGlobalErrorToast:\s*true\s*\}/,
  "Production assignment failures must suppress the shared toast because the page already renders the server message locally.",
);
assert.match(
  orderDetailSource,
  /\?\s*"Ready to assign"\s*:\s*"Waiting"/,
  "Contract-released production tasks must say Ready to assign instead of implying all production prerequisites are ready.",
);

const lifecyclePath = require.resolve(
  "../services/blueprintLifecycleService",
);
const reservationPath = require.resolve(
  "../services/blueprintMaterialReservationService",
);
const consumptionPath = require.resolve(
  "../services/blueprintMaterialConsumptionService",
);

const validLifecycle = {
  status: "OK",
  reason: null,
  order: {
    id: 508,
    order_number: "TEST-508",
    order_type: "blueprint",
    status: "contract_released",
    blueprint_id: 237,
  },
  blueprint: {
    id: 237,
    is_deleted: 0,
    stage: "approved",
  },
  estimation: {
    id: 900,
    status: "approved",
  },
};

function loadConsumptionService({
  reservationResult,
  reservationError = null,
}) {
  class MockReservationError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "BlueprintMaterialReservationError";
      this.code = code;
    }
  }

  const previousLifecycle = require.cache[lifecyclePath];
  const previousReservation = require.cache[reservationPath];
  const previousConsumption = require.cache[consumptionPath];

  require.cache[lifecyclePath] = {
    id: lifecyclePath,
    filename: lifecyclePath,
    loaded: true,
    exports: {
      resolveLifecycleByOrder: async () => validLifecycle,
    },
  };

  require.cache[reservationPath] = {
    id: reservationPath,
    filename: reservationPath,
    loaded: true,
    exports: {
      ensureBlueprintMaterialReservations: async () => {
        if (reservationError) {
          throw new MockReservationError(
            reservationError.code,
            reservationError.message,
          );
        }
        return reservationResult;
      },
      BlueprintMaterialReservationError: MockReservationError,
    },
  };

  delete require.cache[consumptionPath];
  const service = require(consumptionPath);

  if (previousLifecycle) require.cache[lifecyclePath] = previousLifecycle;
  else delete require.cache[lifecyclePath];

  if (previousReservation) require.cache[reservationPath] = previousReservation;
  else delete require.cache[reservationPath];

  if (previousConsumption) require.cache[consumptionPath] = previousConsumption;
  else delete require.cache[consumptionPath];

  return service;
}

function normalizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

function buildFakeConnection({ reservationStatus = "reserved" } = {}) {
  const calls = [];

  return {
    calls,
    async query(sql) {
      const text = normalizeSql(sql);
      calls.push(text);

      if (
        text.includes("SELECT id, material_id") &&
        text.includes("FROM blueprint_material_reservations") &&
        !text.includes("FOR UPDATE")
      ) {
        return [[{ id: 31, material_id: 7 }]];
      }

      if (
        text.includes("FROM raw_materials") &&
        text.includes("FOR UPDATE")
      ) {
        return [[{
          id: 7,
          name: "Test wood",
          unit: "board",
          quantity: "10.00",
          reorder_point: "2.00",
          stock_status: "healthy_stock",
          is_active: 1,
        }]];
      }

      if (
        text.includes("FROM blueprint_material_reservations") &&
        text.includes("FOR UPDATE")
      ) {
        return [[{
          id: 31,
          order_id: 508,
          blueprint_id: 237,
          estimation_id: 900,
          material_id: 7,
          material_name_snapshot: "Test wood",
          unit_snapshot: "board",
          quantity: "2.00",
          status: reservationStatus,
          issue_code:
            reservationStatus === "pending_stock"
              ? "INSUFFICIENT_STOCK"
              : null,
          issue_note:
            reservationStatus === "pending_stock"
              ? "Required 2.00 board; available 0.00 board; shortage 2.00 board"
              : null,
          reserved_at: reservationStatus === "reserved" ? new Date() : null,
          consumed_by: null,
          consumed_at: null,
        }]];
      }

      if (
        text.includes("FROM stock_movements") &&
        text.includes("type = 'out'")
      ) {
        return [[]];
      }

      if (text.startsWith("UPDATE raw_materials SET quantity = quantity - ?")) {
        return [{ affectedRows: 1 }];
      }

      if (text.startsWith("UPDATE raw_materials SET stock_status = CASE")) {
        return [{ affectedRows: 1 }];
      }

      if (text.startsWith("INSERT INTO stock_movements")) {
        return [{ affectedRows: 1, insertId: 91 }];
      }

      if (
        text.startsWith("UPDATE blueprint_material_reservations") &&
        text.includes("SET status = 'consumed'")
      ) {
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected fake SQL: ${text}`);
    },
  };
}

async function run() {
  {
    const service = loadConsumptionService({
      reservationResult: {
        triggered: true,
        reason: "NO_INVENTORY_MATERIALS",
        threshold_reached: true,
        overall_status: "not_required",
        reserved_count: 0,
        pending_stock_count: 0,
        materials: [],
      },
    });

    let queried = false;
    const conn = {
      async query() {
        queried = true;
        throw new Error("No reservation/stock query expected for no-material case.");
      },
    };

    const result = await service.consumeBlueprintMaterialsForProduction(conn, {
      orderId: 508,
      actorUserId: 1,
    });

    assert.equal(result.triggered, false);
    assert.equal(result.reason, "NO_INVENTORY_MATERIALS");
    assert.equal(result.consumed_count, 0);
    assert.deepEqual(result.reservation_ids, []);
    assert.deepEqual(result.stock_movement_ids, []);
    assert.equal(queried, false);
  }

  {
    const service = loadConsumptionService({
      reservationResult: {
        triggered: true,
        reason: null,
        threshold_reached: true,
        overall_status: "reserved",
        reserved_count: 1,
        pending_stock_count: 0,
        materials: [],
      },
    });

    const conn = buildFakeConnection({ reservationStatus: "reserved" });
    const result = await service.consumeBlueprintMaterialsForProduction(conn, {
      orderId: 508,
      actorUserId: 1,
    });

    assert.equal(result.triggered, true);
    assert.equal(result.reason, "CONSUMED_FOR_PRODUCTION");
    assert.equal(result.consumed_count, 1);
    assert.deepEqual(result.reservation_ids, [31]);
    assert.deepEqual(result.stock_movement_ids, [91]);
    assert.ok(
      conn.calls.some((sql) =>
        sql.startsWith("UPDATE raw_materials SET quantity = quantity - ?"),
      ),
      "Recovered reservation path must physically deduct stock exactly through the existing guarded deduction path.",
    );
    assert.ok(
      conn.calls.some((sql) =>
        sql.startsWith("INSERT INTO stock_movements"),
      ),
      "Recovered reservation path must keep stock-movement audit history.",
    );
  }

  {
    const service = loadConsumptionService({
      reservationResult: {
        triggered: true,
        reason: null,
        threshold_reached: true,
        overall_status: "pending_stock",
        reserved_count: 0,
        pending_stock_count: 1,
        materials: [],
      },
    });

    const conn = buildFakeConnection({ reservationStatus: "pending_stock" });

    await assert.rejects(
      () =>
        service.consumeBlueprintMaterialsForProduction(conn, {
          orderId: 508,
          actorUserId: 1,
        }),
      (err) => {
        assert.equal(err.code, "MATERIALS_PENDING_STOCK");
        return true;
      },
    );

    assert.equal(
      conn.calls.some((sql) =>
        sql.startsWith("UPDATE raw_materials SET quantity = quantity - ?"),
      ),
      false,
      "Pending-stock production must not deduct stock.",
    );
    assert.equal(
      conn.calls.some((sql) =>
        sql.startsWith("INSERT INTO stock_movements"),
      ),
      false,
      "Pending-stock production must not create stock-out history.",
    );
  }

  {
    const service = loadConsumptionService({
      reservationResult: {
        triggered: false,
        reason: "BELOW_REQUIRED_30_PERCENT",
        threshold_reached: false,
        verified_total: 500,
        required_minimum: 1000,
        materials: [],
      },
    });

    const conn = {
      async query() {
        throw new Error("No stock query expected below the payment threshold.");
      },
    };

    await assert.rejects(
      () =>
        service.consumeBlueprintMaterialsForProduction(conn, {
          orderId: 508,
          actorUserId: 1,
        }),
      (err) => {
        assert.equal(err.code, "BLUEPRINT_DOWN_PAYMENT_NOT_REACHED");
        assert.equal(err.statusCode, 409);
        return true;
      },
    );
  }

  {
    const service = loadConsumptionService({
      reservationResult: null,
      reservationError: {
        code: "ESTIMATION_ITEM_SNAPSHOT_MISMATCH",
        message: "Approved estimation materials are inconsistent.",
      },
    });

    const conn = {
      async query() {
        throw new Error("No stock query expected after reservation integrity failure.");
      },
    };

    await assert.rejects(
      () =>
        service.consumeBlueprintMaterialsForProduction(conn, {
          orderId: 508,
          actorUserId: 1,
        }),
      (err) => {
        assert.ok(
          err instanceof service.BlueprintMaterialConsumptionError,
          "Reservation integrity failures must be translated to the controller's existing consumption-error contract.",
        );
        assert.equal(err.code, "ESTIMATION_ITEM_SNAPSHOT_MISMATCH");
        assert.equal(err.statusCode, 409);
        return true;
      },
    );
  }

  console.log(
    "PASS: Blueprint production material reconciliation, no-material allowance, stock safety, payment gate, and single-toast integrity checks passed.",
  );
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
