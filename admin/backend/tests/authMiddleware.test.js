"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const middlewarePath = path.resolve(__dirname, "../middleware/auth.js");

const originalLoad = Module._load;

const SESSION_USER = {
  session_id: 101,
  user_id: 7,
  name: "Test User",
  email: "test@example.com",
  role: "staff",
  authority_level: "manager",
  staff_type: "cashier",
  is_active: 1,
  is_verified: 1,
  must_change_password: 0,
  token_version: 0,
};

const JWT_USER = {
  id: 7,
  name: "Test User",
  email: "test@example.com",
  role: "staff",
  authority_level: "manager",
  staff_type: "cashier",
  is_active: 1,
  is_verified: 1,
  must_change_password: 0,
  token_version: 0,
};

function createHarness(options = {}) {
  const state = {
    validatedTokens: [],
    touchedSessions: [],
    jwtVerifiedTokens: [],
    databaseQueries: [],
  };

  const sessionService = {
    validateSession: async (token) => {
      state.validatedTokens.push(token);

      if (options.validateSessionError) {
        throw options.validateSessionError;
      }

      return options.session === undefined ? SESSION_USER : options.session;
    },

    touchSession: async (sessionId) => {
      state.touchedSessions.push(sessionId);

      if (options.touchSessionError) {
        throw options.touchSessionError;
      }

      return true;
    },
  };

  const jwt = {
    verify: (token, secret) => {
      state.jwtVerifiedTokens.push({ token, secret });

      if (options.jwtError) {
        throw options.jwtError;
      }

      return (
        options.decodedToken || {
          id: 7,
          token_version: 0,
        }
      );
    },
  };

  const pool = {
    query: async (sql, params) => {
      state.databaseQueries.push({ sql, params });

      if (options.databaseError) {
        throw options.databaseError;
      }

      return [[options.jwtUser === undefined ? JWT_USER : options.jwtUser]];
    },
  };

  const auditLog = {
    writeAuditLogSafe: async () => {},
  };

  // Mock only the dependencies imported by auth.js.
  // No real database connection or JWT verification is used.
  delete require.cache[middlewarePath];

  Module._load = function (request, parent, isMain) {
    if (parent && path.resolve(parent.filename) === middlewarePath) {
      if (request === "jsonwebtoken") return jwt;
      if (request === "../config/db") return pool;
      if (request === "./auditLog") return auditLog;

      if (request === "../services/authSessionService") {
        return sessionService;
      }
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  let middleware;

  try {
    middleware = require(middlewarePath);
  } finally {
    Module._load = originalLoad;
  }

  return { middleware, state };
}

function createRequest({
  cookie,
  authorization,
  originalUrl = "/api/private",
} = {}) {
  const headers = {};

  if (cookie !== undefined) {
    headers.cookie = cookie;
  }

  if (authorization !== undefined) {
    headers.authorization = authorization;
  }

  return {
    headers,
    originalUrl,
    path: originalUrl,
    method: "GET",
    ip: "127.0.0.1",
  };
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

async function runAuthenticate(middleware, request) {
  const response = createResponse();
  let nextCalled = false;

  await middleware.authenticate(request, response, () => {
    nextCalled = true;
  });

  return {
    request,
    response,
    nextCalled,
  };
}

test("rejects requests with no cookie and no Bearer token", async () => {
  const { middleware, state } = createHarness();

  const result = await runAuthenticate(middleware, createRequest());

  assert.equal(result.response.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.equal(state.validatedTokens.length, 0);
  assert.equal(state.jwtVerifiedTokens.length, 0);
});

test("accepts a valid session cookie and sets session auth metadata", async () => {
  const { middleware, state } = createHarness();

  const result = await runAuthenticate(
    middleware,
    createRequest({
      cookie: "other=value; wisdom_session=session-secret",
    }),
  );

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.nextCalled, true);
  assert.equal(result.request.user.id, SESSION_USER.user_id);
  assert.equal(result.request.user.session_id, 101);
  assert.equal(result.request.user.auth_method, "session");

  assert.deepEqual(state.validatedTokens, ["session-secret"]);
  assert.deepEqual(state.touchedSessions, [101]);
  assert.equal(state.jwtVerifiedTokens.length, 0);
  assert.equal(state.databaseQueries.length, 0);
});

test("preserves equals signs inside the session cookie value", async () => {
  const { middleware, state } = createHarness();

  const result = await runAuthenticate(
    middleware,
    createRequest({
      cookie: "other=value; wisdom_session=secret%3Dpart",
    }),
  );

  assert.equal(result.nextCalled, true);
  assert.deepEqual(state.validatedTokens, ["secret=part"]);
});

test("rejects an invalid session cookie without JWT fallback", async () => {
  const { middleware, state } = createHarness({
    session: null,
  });

  const result = await runAuthenticate(
    middleware,
    createRequest({
      cookie: "wisdom_session=invalid-secret",
      authorization: "Bearer otherwise-valid-token",
    }),
  );

  assert.equal(result.response.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.equal(state.validatedTokens.length, 1);
  assert.equal(state.jwtVerifiedTokens.length, 0);
  assert.equal(state.databaseQueries.length, 0);
});

test("rejects a malformed encoded cookie without JWT fallback", async () => {
  const { middleware, state } = createHarness();

  const result = await runAuthenticate(
    middleware,
    createRequest({
      cookie: "wisdom_session=%E0%A4%A",
      authorization: "Bearer otherwise-valid-token",
    }),
  );

  assert.equal(result.response.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.equal(state.validatedTokens.length, 0);
  assert.equal(state.jwtVerifiedTokens.length, 0);
});

test("allows temporary JWT compatibility when no session cookie exists", async () => {
  const { middleware, state } = createHarness();

  const result = await runAuthenticate(
    middleware,
    createRequest({
      authorization: "Bearer legacy-token",
    }),
  );

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.nextCalled, true);
  assert.equal(result.request.user.id, JWT_USER.id);
  assert.equal(result.request.user.auth_method, "jwt");

  assert.deepEqual(state.jwtVerifiedTokens, [
    {
      token: "legacy-token",
      secret: process.env.JWT_SECRET,
    },
  ]);

  assert.equal(state.databaseQueries.length, 1);
  assert.match(state.databaseQueries[0].sql, /FROM users\s+WHERE id = \?/i);
  assert.deepEqual(state.databaseQueries[0].params, [7]);
});

test("rejects an invalid JWT", async () => {
  const { middleware, state } = createHarness({
    jwtError: Object.assign(new Error("Invalid token"), {
      name: "JsonWebTokenError",
    }),
  });

  const result = await runAuthenticate(
    middleware,
    createRequest({
      authorization: "Bearer invalid-token",
    }),
  );

  assert.equal(result.response.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.equal(state.databaseQueries.length, 0);
});

test("rejects a JWT when its token version differs from the user record", async () => {
  const { middleware } = createHarness({
    decodedToken: {
      id: 7,
      token_version: 1,
    },
    jwtUser: {
      ...JWT_USER,
      token_version: 0,
    },
  });

  const result = await runAuthenticate(
    middleware,
    createRequest({
      authorization: "Bearer stale-token",
    }),
  );

  assert.equal(result.response.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.match(result.response.body.message, /revoked/i);
});

test("rejects an inactive user on the JWT compatibility path", async () => {
  const { middleware } = createHarness({
    jwtUser: {
      ...JWT_USER,
      is_active: 0,
    },
  });

  const result = await runAuthenticate(
    middleware,
    createRequest({
      authorization: "Bearer legacy-token",
    }),
  );

  assert.equal(result.response.statusCode, 403);
  assert.equal(result.nextCalled, false);
});

test("returns 401 when session validation finds an expired or revoked session", async () => {
  const { middleware, state } = createHarness({
    session: null,
  });

  const result = await runAuthenticate(
    middleware,
    createRequest({
      cookie: "wisdom_session=expired-session",
    }),
  );

  assert.equal(result.response.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.equal(state.touchedSessions.length, 0);
});

test("fails closed when session validation throws a database error", async () => {
  const { middleware, state } = createHarness({
    validateSessionError: Object.assign(new Error("Database unavailable"), {
      code: "ECONNREFUSED",
    }),
  });

  const result = await runAuthenticate(
    middleware,
    createRequest({
      cookie: "wisdom_session=session-secret",
    }),
  );

  assert.equal(result.response.statusCode, 503);
  assert.equal(result.nextCalled, false);
  assert.equal(state.touchedSessions.length, 0);
});

test("fails closed when updating session activity throws a database error", async () => {
  const { middleware, state } = createHarness({
    touchSessionError: Object.assign(new Error("Database unavailable"), {
      code: "ECONNREFUSED",
    }),
  });

  const result = await runAuthenticate(
    middleware,
    createRequest({
      cookie: "wisdom_session=session-secret",
    }),
  );

  assert.equal(result.response.statusCode, 503);
  assert.equal(result.nextCalled, false);
  assert.equal(state.touchedSessions.length, 1);

  // Authentication must not continue after the activity update fails.
  assert.equal(result.request.user, undefined);
});

test("blocks staff with a temporary password from private routes", async () => {
  const { middleware, state } = createHarness({
    session: {
      ...SESSION_USER,
      must_change_password: 1,
    },
  });

  const result = await runAuthenticate(
    middleware,
    createRequest({
      cookie: "wisdom_session=session-secret",
      originalUrl: "/api/products",
    }),
  );

  assert.equal(result.response.statusCode, 403);
  assert.equal(result.response.body.code, "PASSWORD_CHANGE_REQUIRED");
  assert.equal(result.nextCalled, false);
  assert.equal(state.touchedSessions.length, 0);
});

test("allows staff with a temporary password to access the auth/me route", async () => {
  const { middleware } = createHarness({
    session: {
      ...SESSION_USER,
      must_change_password: 1,
    },
  });

  const result = await runAuthenticate(
    middleware,
    createRequest({
      cookie: "wisdom_session=session-secret",
      originalUrl: "/api/auth/me",
    }),
  );

  assert.equal(result.response.statusCode, 200);
  assert.equal(result.nextCalled, true);
  assert.equal(result.request.user.must_change_password, 1);
});

test("blocks JWT-authenticated staff with a temporary password from private routes", async () => {
  const { middleware } = createHarness({
    jwtUser: {
      ...JWT_USER,
      must_change_password: 1,
    },
  });

  const result = await runAuthenticate(
    middleware,
    createRequest({
      authorization: "Bearer legacy-token",
      originalUrl: "/api/products",
    }),
  );

  assert.equal(result.response.statusCode, 403);
  assert.equal(result.response.body.code, "PASSWORD_CHANGE_REQUIRED");
  assert.equal(result.nextCalled, false);
});
