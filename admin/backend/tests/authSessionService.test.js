/**
 * Focused unit tests for services/authSessionService.js.
 *
 * File: admin/backend/tests/authSessionService.test.js
 * Run from admin/backend:
 * node --test tests/authSessionService.test.js
 *
 * The database module is mocked before the service is loaded.
 * These tests do not intentionally connect to Aiven or write to a real database.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const path = require("node:path");

const servicePath = path.resolve(
  __dirname,
  "../services/authSessionService.js",
);

const dbPath = path.resolve(__dirname, "../config/db.js");

const originalLoad = Module._load;

let mockPool;
let service;

function setMockQuery(handler) {
  mockPool.query = async (...args) => handler(...args);
}

function loadServiceWithMockDatabase() {
  delete require.cache[servicePath];
  delete require.cache[dbPath];

  mockPool = {
    query: async () => {
      throw new Error("Unexpected database query");
    },
  };

  Module._load = function (request, parent, isMain) {
    if (
      parent &&
      path.resolve(parent.filename) === servicePath &&
      request === "../config/db"
    ) {
      return mockPool;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    service = require(servicePath);
  } finally {
    Module._load = originalLoad;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

test.beforeEach(() => {
  loadServiceWithMockDatabase();
});

test.after(() => {
  Module._load = originalLoad;
  delete require.cache[servicePath];
  delete require.cache[dbPath];
});

test("createSession stores a SHA-256 hash and returns a random session secret", async () => {
  let insertedValues;
  let queryCount = 0;

  setMockQuery(async (sql, values) => {
    queryCount += 1;

    if (sql.includes("INSERT INTO auth_sessions")) {
      insertedValues = values;
      return [{ affectedRows: 1 }];
    }

    if (sql.includes("SELECT id") && sql.includes("session_token_hash")) {
      return [[{ id: 42 }]];
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await service.createSession({
    userId: 7,
    ipAddress: "127.0.0.1",
    userAgent: "Unit test",
  });

  assert.match(result.sessionToken, /^[a-f0-9]{64}$/);
  assert.equal(result.sessionId, 42);
  assert.ok(result.expiresAt instanceof Date);

  assert.equal(insertedValues[0], sha256(result.sessionToken));
  assert.notEqual(insertedValues[0], result.sessionToken);

  assert.equal(insertedValues[2], "127.0.0.1");
  assert.equal(insertedValues[3], "Unit test");
  assert.equal(queryCount, 2);
});

test("createSession rejects invalid user IDs without querying the database", async () => {
  let queried = false;

  setMockQuery(async () => {
    queried = true;
    return [{ affectedRows: 1 }];
  });

  await assert.rejects(service.createSession({ userId: 0 }), {
    name: "TypeError",
  });

  await assert.rejects(service.createSession({ userId: "not-a-number" }), {
    name: "TypeError",
  });

  assert.equal(queried, false);
});

test("createSession rejects when no active user row is inserted", async () => {
  setMockQuery(async (sql) => {
    assert.match(sql, /INSERT INTO auth_sessions/);
    return [{ affectedRows: 0 }];
  });

  await assert.rejects(
    service.createSession({ userId: 7 }),
    /Unable to create a session/,
  );
});

test("createSession rejects if it cannot confirm the inserted session", async () => {
  setMockQuery(async (sql) => {
    if (sql.includes("INSERT INTO auth_sessions")) {
      return [{ affectedRows: 1 }];
    }

    if (sql.includes("SELECT id")) {
      return [[]];
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await assert.rejects(
    service.createSession({ userId: 7 }),
    /Unable to confirm the created session/,
  );
});

test("validateSession rejects malformed tokens without querying the database", async () => {
  let queried = false;

  setMockQuery(async () => {
    queried = true;
    return [[]];
  });

  assert.equal(await service.validateSession(null), null);
  assert.equal(await service.validateSession("short"), null);
  assert.equal(await service.validateSession("z".repeat(64)), null);

  assert.equal(queried, false);
});

test("validateSession hashes valid tokens and checks session validity in SQL", async () => {
  const rawToken = "a".repeat(64);
  let receivedHash;

  setMockQuery(async (sql, values) => {
    assert.match(sql, /s\.revoked_at IS NULL/);
    assert.match(sql, /s\.expires_at > UTC_TIMESTAMP\(\)/);
    assert.match(sql, /u\.is_active = 1/);

    assert.match(sql, /s\.token_version = COALESCE\(u\.token_version, 0\)/);

    receivedHash = values[0];

    return [
      [
        {
          session_id: 3,
          user_id: 7,
          token_version: 2,
        },
      ],
    ];
  });

  const session = await service.validateSession(rawToken);

  assert.equal(receivedHash, sha256(rawToken));
  assert.equal(session.session_id, 3);
});

test("validateSession returns null when no valid session is found", async () => {
  setMockQuery(async () => [[]]);

  assert.equal(await service.validateSession("b".repeat(64)), null);
});

test("validateSession propagates database errors", async () => {
  setMockQuery(async () => {
    const error = new Error("Database unavailable");
    error.code = "ECONNREFUSED";
    throw error;
  });

  await assert.rejects(service.validateSession("c".repeat(64)), {
    code: "ECONNREFUSED",
  });
});

test("touchSession rejects invalid session IDs without querying the database", async () => {
  let queried = false;

  setMockQuery(async () => {
    queried = true;
    return [{ affectedRows: 1 }];
  });

  assert.equal(await service.touchSession(0), false);
  assert.equal(await service.touchSession("not-a-number"), false);

  assert.equal(queried, false);
});

test("touchSession propagates database errors", async () => {
  setMockQuery(async () => {
    throw new Error("Database unavailable");
  });

  await assert.rejects(service.touchSession(3), /Database unavailable/);
});

test("revokeSession rejects malformed tokens without querying the database", async () => {
  let queried = false;

  setMockQuery(async () => {
    queried = true;
    return [{ affectedRows: 1 }];
  });

  assert.equal(await service.revokeSession("invalid"), false);

  assert.equal(queried, false);
});

test("revokeSession hashes the secret and returns whether a row was revoked", async () => {
  const rawToken = "d".repeat(64);
  let receivedHash;

  setMockQuery(async (sql, values) => {
    assert.match(sql, /SET revoked_at = UTC_TIMESTAMP\(\)/);
    assert.match(sql, /revoked_at IS NULL/);

    receivedHash = values[0];

    return [{ affectedRows: 1 }];
  });

  assert.equal(await service.revokeSession(rawToken), true);

  assert.equal(receivedHash, sha256(rawToken));
});

test("revokeAllUserSessions validates the user ID and returns affected rows", async () => {
  let receivedUserId;

  setMockQuery(async (sql, values) => {
    assert.match(sql, /WHERE user_id = \?/);
    assert.match(sql, /revoked_at IS NULL/);

    receivedUserId = values[0];

    return [{ affectedRows: 4 }];
  });

  await assert.rejects(service.revokeAllUserSessions(-1), {
    name: "TypeError",
  });

  assert.equal(await service.revokeAllUserSessions("7"), 4);

  assert.equal(receivedUserId, 7);
});

test("revocation operations propagate database errors", async () => {
  setMockQuery(async () => {
    throw new Error("Database unavailable");
  });

  await assert.rejects(
    service.revokeSession("e".repeat(64)),
    /Database unavailable/,
  );

  await assert.rejects(
    service.revokeAllUserSessions(7),
    /Database unavailable/,
  );
});
