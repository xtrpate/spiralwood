"use strict";

const assert = require("node:assert/strict");

const controllerPath = require.resolve(
  "../controllers/customer/customer.auth",
);
const dbPath = require.resolve("../config/db");
const auditPath = require.resolve("../middleware/auditLog");
const permissionPath = require.resolve("../services/permissionService");
const recaptchaPath = require.resolve("../utils/verifyRecaptcha");
const smsPath = require.resolve("../services/semaphore.service");
const bcryptPath = require.resolve("bcryptjs");
const jwtPath = require.resolve("jsonwebtoken");

let selectedRows = [];
let passwordMatches = true;
let auditCalls = [];
let queryCalls = [];

const mockDb = {
  query: async (sql, params) => {
    queryCalls.push({ sql: String(sql), params });

    if (/SELECT[\s\S]*FROM users/i.test(String(sql))) {
      return [selectedRows];
    }

    return [{ affectedRows: 1 }];
  },
};

const mockAudit = {
  writeAuditLogSafe: async (payload) => {
    auditCalls.push(payload);
    return true;
  },
};

const mockPermission = {
  getEffectivePermissionsForUser: async () => ["dashboard.view"],
};

const mockRecaptcha = {
  verifyRecaptcha: async () => true,
};

const mockSms = {
  sendSms: async () => true,
};

const mockBcrypt = {
  compare: async () => passwordMatches,
  hash: async () => "hashed-value",
};

const mockJwt = {
  sign: () => "test-token",
  verify: () => ({ id: 1 }),
};

const installMock = (modulePath, exportsValue) => {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsValue,
    children: [],
    paths: [],
  };
};

installMock(dbPath, mockDb);
installMock(auditPath, mockAudit);
installMock(permissionPath, mockPermission);
installMock(recaptchaPath, mockRecaptcha);
installMock(smsPath, mockSms);
installMock(bcryptPath, mockBcrypt);
installMock(jwtPath, mockJwt);

delete require.cache[controllerPath];
const authController = require(controllerPath);

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const makeUser = (overrides = {}) => ({
  id: 1,
  name: "System Administrator",
  email: "admin@spiralwood.com",
  password: "hashed",
  role: "admin",
  authority_level: "admin",
  staff_type: null,
  phone: "09170000000",
  address: "Test Address",
  address_lat: null,
  address_lng: null,
  profile_photo: null,
  is_verified: 1,
  phone_verified: 1,
  is_active: 1,
  must_change_password: 0,
  token_version: 0,
  ...overrides,
});

const resetState = () => {
  selectedRows = [];
  passwordMatches = true;
  auditCalls = [];
  queryCalls = [];
};

const testSuccessfulUnifiedLoginAudit = async () => {
  resetState();
  selectedRows = [makeUser()];

  const req = {
    body: {
      email: "  ADMIN@spiralwood.com ",
      password: "correct-password",
    },
    ip: "::1",
  };
  const res = makeResponse();

  await authController.login(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.token, "test-token");
  assert.equal(auditCalls.length, 1);

  const audit = auditCalls[0];
  assert.equal(audit.action, "login_success");
  assert.equal(audit.tableName, "security");
  assert.equal(audit.userId, 1);
  assert.equal(audit.recordId, 1);
  assert.equal(audit.actorType, "user");
  assert.equal(audit.responseStatus, 200);
  assert.equal(audit.newValues.attempted_email, "admin@spiralwood.com");
  assert.equal(audit.newValues.result, "success");
  assert.equal(audit.newValues.reason, "authenticated");
  assert.equal(audit.newValues.user_role, "admin");

  assert.equal(
    queryCalls.some((call) => /last_login = NOW\(\)/i.test(call.sql)),
    true,
  );
};

const testInvalidPasswordAudit = async () => {
  resetState();
  selectedRows = [makeUser()];
  passwordMatches = false;

  const req = {
    body: {
      email: "admin@spiralwood.com",
      password: "wrong-password",
    },
    ip: "::1",
  };
  const res = makeResponse();

  await authController.login(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, "Invalid email or password.");
  assert.equal(auditCalls.length, 1);

  const audit = auditCalls[0];
  assert.equal(audit.action, "login_failed");
  assert.equal(audit.userId, 1);
  assert.equal(audit.actorType, "anonymous");
  assert.equal(audit.responseStatus, 401);
  assert.equal(audit.newValues.reason, "invalid_credentials");
  assert.equal(audit.newValues.result, "failed");
  assert.equal(Object.hasOwn(audit.newValues, "password"), false);
};

const testUnknownEmailAudit = async () => {
  resetState();
  selectedRows = [];

  const req = {
    body: {
      email: "missing@example.com",
      password: "anything",
    },
    ip: "::1",
  };
  const res = makeResponse();

  await authController.login(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(auditCalls.length, 1);

  const audit = auditCalls[0];
  assert.equal(audit.action, "login_failed");
  assert.equal(audit.userId, null);
  assert.equal(audit.recordId, null);
  assert.equal(audit.actorType, "anonymous");
  assert.equal(audit.responseStatus, 401);
  assert.equal(audit.newValues.reason, "invalid_credentials");
};

const testMissingCredentialsAudit = async () => {
  resetState();

  const req = {
    body: {
      email: "admin@spiralwood.com",
    },
    ip: "::1",
  };
  const res = makeResponse();

  await authController.login(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(auditCalls.length, 1);

  const audit = auditCalls[0];
  assert.equal(audit.action, "login_failed");
  assert.equal(audit.actorType, "anonymous");
  assert.equal(audit.responseStatus, 400);
  assert.equal(audit.newValues.reason, "missing_credentials");
};

const testInactiveAccountAudit = async () => {
  resetState();
  selectedRows = [makeUser({ is_active: 0 })];

  const req = {
    body: {
      email: "admin@spiralwood.com",
      password: "correct-password",
    },
    ip: "::1",
  };
  const res = makeResponse();

  await authController.login(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(auditCalls.length, 1);

  const audit = auditCalls[0];
  assert.equal(audit.action, "login_failed");
  assert.equal(audit.actorType, "anonymous");
  assert.equal(audit.responseStatus, 403);
  assert.equal(audit.newValues.reason, "account_inactive");
};

(async () => {
  await testSuccessfulUnifiedLoginAudit();
  await testInvalidPasswordAudit();
  await testUnknownEmailAudit();
  await testMissingCredentialsAudit();
  await testInactiveAccountAudit();

  console.log("PASS: Customer unified-login audit coverage tests passed.");
})().catch((error) => {
  console.error("FAIL: Customer unified-login audit coverage tests failed.");
  console.error(error);
  process.exitCode = 1;
});