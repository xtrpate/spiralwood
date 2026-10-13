"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const controllerPath = path.resolve(
  __dirname,
  "../controllers/customer/customer.auth.js",
);

const originalLoad = Module._load;

function createHarness({ updateAffectedRows = 1, jwtError = null } = {}) {
  const state = {
    queries: [],
    committed: false,
    rolledBack: false,
    released: false,
    auditLogs: [],
  };

  const connection = {
    beginTransaction: async () => {},

    commit: async () => {
      state.committed = true;
    },

    rollback: async () => {
      state.rolledBack = true;
    },

    release: () => {
      state.released = true;
    },

    query: async (sql, params = []) => {
      state.queries.push({ sql, params });

      if (/SELECT\s+id,\s*email,\s*password,\s*role/i.test(sql)) {
        return [
          [
            {
              id: 7,
              email: "customer@example.com",
              password: "old-password-hash",
              role: "customer",
              is_verified: 1,
              is_active: 1,
              otp_code: "$2b$mocked-otp-hash",
              otp_purpose: "password_reset",
              otp_expires: new Date(Date.now() + 10 * 60 * 1000),
            },
          ],
        ];
      }

      if (/SELECT\s+password_hash/i.test(sql)) {
        return [[]];
      }

      if (/UPDATE\s+users/i.test(sql)) {
        return [
          {
            affectedRows: updateAffectedRows,
          },
        ];
      }

      if (/SELECT\s+id\s+FROM\s+user_password_history/i.test(sql)) {
        return [[]];
      }

      return [{ affectedRows: 1 }];
    },
  };

  const db = {
    getConnection: async () => connection,
    query: async () => [[]],
  };

  const bcrypt = {
    compare: async (supplied, stored) =>
      stored === "$2b$mocked-otp-hash" && supplied === "654321",

    hash: async () => "new-password-hash",
  };

  const jwt = {
    verify: () => {
      if (jwtError) {
        throw jwtError;
      }

      return {
        id: 7,
        purpose: "password_reset",
        jti: "654321",
      };
    },
  };

  const auditLog = {
    writeAuditLogSafe: async (entry) => {
      state.auditLogs.push(entry);
    },
  };

  const mocks = {
    bcryptjs: bcrypt,
    jsonwebtoken: jwt,
    "../../config/db": db,
    "../../middleware/auditLog": auditLog,
    "../../services/authSessionService": {
      createSession: async () => {
        throw new Error("Not expected in password-reset tests");
      },
    },
    "../../services/permissionService": {
      getEffectivePermissionsForUser: async () => [],
    },
    "../../utils/verifyRecaptcha": {
      verifyRecaptcha: async () => true,
    },
    "../../services/semaphore.service": {
      sendSms: async () => true,
    },
    "../../utils/emailHelper": {
      buildOtpEmailHtml: async () => "",
      sendBrevoEmail: async () => true,
    },
    "../../utils/phone": {
      normalizePhilippinePhone: (value) => value,
      getPhoneLookupVariants: () => [],
      phoneDigitsSql: () => "phone",
    },
  };

  delete require.cache[controllerPath];

  Module._load = function (request, parent, isMain) {
    if (
      parent &&
      path.resolve(parent.filename) === controllerPath &&
      Object.prototype.hasOwnProperty.call(mocks, request)
    ) {
      return mocks[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  let controller;

  try {
    controller = require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }

  return { controller, state };
}

function createResponse() {
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

function createRequest() {
  return {
    body: {
      reset_token: "test-reset-token",
      new_password: "NewSecure!Password123",
    },
    ip: "127.0.0.1",
  };
}

test("successful password reset increments token_version and commits", async () => {
  const { controller, state } = createHarness();
  const req = createRequest();
  const res = createResponse();

  await controller.resetPassword(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body.message, /reset successful/i);
  assert.equal(state.committed, true);
  assert.equal(state.rolledBack, false);
  assert.equal(state.released, true);

  const update = state.queries.find(({ sql }) => /UPDATE\s+users/i.test(sql));

  assert.ok(update, "Expected the users password UPDATE query");

  assert.match(
    update.sql,
    /token_version\s*=\s*COALESCE\s*\(\s*token_version\s*,\s*0\s*\)\s*\+\s*1/i,
    "Password reset must increment token_version",
  );

  assert.deepEqual(update.params, ["new-password-hash", 7]);

  assert.ok(
    /otp_code\s*=\s*NULL/i.test(update.sql),
    "Password reset must clear the OTP",
  );

  assert.ok(
    /otp_purpose\s*=\s*NULL/i.test(update.sql),
    "Password reset must clear the OTP purpose",
  );

  assert.ok(
    /otp_expires\s*=\s*NULL/i.test(update.sql),
    "Password reset must clear the OTP expiry",
  );
});

test("rejects a reset when the conditional password UPDATE affects no row", async () => {
  const { controller, state } = createHarness({
    updateAffectedRows: 0,
  });

  const req = createRequest();
  const res = createResponse();

  await controller.resetPassword(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, true);
  assert.equal(state.released, true);

  assert.equal(
    state.queries.some(({ sql }) =>
      /INSERT\s+INTO\s+user_password_history/i.test(sql),
    ),
    false,
    "Password history must not be written after a rejected update",
  );
});

test("rejects an invalid reset token before opening a database transaction", async () => {
  const { controller, state } = createHarness({
    jwtError: Object.assign(new Error("Expired token"), {
      name: "TokenExpiredError",
    }),
  });

  const req = createRequest();
  const res = createResponse();

  await controller.resetPassword(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(state.queries.length, 0);
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, false);
});
