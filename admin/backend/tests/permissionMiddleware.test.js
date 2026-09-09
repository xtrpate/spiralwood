const assert = require("node:assert/strict");

const {
  buildEffectivePermissionSet,
  hasPermission,
  createRequirePermissionMiddleware,
} = require("../middleware/permission");

async function runTests() {
  // ============================================================
  // TEST 1
  // Authority + role permissions must be combined.
  // ============================================================

  {
    const effective = buildEffectivePermissionSet(
      [{ permission_key: "dashboard.view" }, { permission_key: "orders.view" }],
      [
        { permission_key: "orders.manage" },
        { permission_key: "sales_report.export" },
      ],
    );

    assert.equal(hasPermission(effective, "dashboard.view"), true);
    assert.equal(hasPermission(effective, "orders.view"), true);
    assert.equal(hasPermission(effective, "orders.manage"), true);
    assert.equal(hasPermission(effective, "sales_report.export"), true);
  }

  // ============================================================
  // TEST 2
  // A permission that exists only in neither source is denied.
  // ============================================================

  {
    const effective = buildEffectivePermissionSet(
      [{ permission_key: "dashboard.view" }],
      [{ permission_key: "orders.view" }],
    );

    assert.equal(hasPermission(effective, "backup.manage"), false);
  }

  // ============================================================
  // TEST 3
  // NEVER_GRANT permissions must stay denied even if supplied.
  // ============================================================

  {
    const effective = buildEffectivePermissionSet(
      [{ permission_key: "audit_logs.edit" }],
      [{ permission_key: "audit_logs.delete" }],
    );

    assert.equal(hasPermission(effective, "audit_logs.edit"), false);
    assert.equal(hasPermission(effective, "audit_logs.delete"), false);
  }

  // ============================================================
  // TEST 4
  // Middleware must return 401 when authenticate() has not run.
  // ============================================================

  {
    let statusCode = null;
    let responseBody = null;
    let nextCalled = false;

    const middleware = createRequirePermissionMiddleware({
      dbPool: {
        query: async () => {
          throw new Error("DB should not be touched without req.user");
        },
      },
      auditLogger: async () => {},
    })("orders.view");

    const req = {
      user: null,
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return body;
      },
    };

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(statusCode, 401);
    assert.deepEqual(responseBody, {
      message: "Authentication required.",
    });
    assert.equal(nextCalled, false);
  }

  // ============================================================
  // TEST 5
  // Middleware permits a permission found through authority.
  // ============================================================

  {
    let nextCalled = false;

    const middleware = createRequirePermissionMiddleware({
      dbPool: {
        query: async (sql) => {
          if (sql.includes("authority_permissions")) {
            return [[{ permission_key: "orders.manage" }]];
          }

          return [[]];
        },
      },
      auditLogger: async () => {},
    })("orders.manage");

    const req = {
      user: {
        id: 10,
        authority_level: "manager",
        role: "staff",
        staff_type: "cashier",
      },
    };

    const res = {
      status() {
        throw new Error("Expected permission to be granted");
      },
    };

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
  }

  // ============================================================
  // TEST 6
  // Middleware denies a permission that exists nowhere.
  // ============================================================

  {
    let statusCode = null;
    let responseBody = null;
    let nextCalled = false;

    const middleware = createRequirePermissionMiddleware({
      dbPool: {
        query: async () => [[]],
      },
      auditLogger: async () => {},
    })("backup.manage");

    const req = {
      user: {
        id: 11,
        authority_level: "manager",
        role: "staff",
        staff_type: "cashier",
      },
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return body;
      },
    };

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(statusCode, 403);
    assert.deepEqual(responseBody, {
      message: "Forbidden. You lack the required permission.",
    });
    assert.equal(nextCalled, false);
  }

  console.log("✅ Permission middleware tests passed.");
}

runTests().catch((error) => {
  console.error("❌ Permission middleware tests failed.");
  console.error(error);
  process.exitCode = 1;
});
