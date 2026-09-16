"use strict";

const assert = require("node:assert/strict");
const {
  normalizeInternalAccess,
  isSuperAdminAccount,
  isManagerAccount,
  isStandardStaffAccount,
  canManageInternalAccount,
  canCreateInternalAccount,
} = require("../utils/internalAccessPolicy");
const {
  MODULE_ACTIONS,
  AUTHORITY_DEFAULTS,
  POLICY_NOTES,
} = require("../config/permissionMatrix");

function run() {
  const staff = normalizeInternalAccess({
    role: "staff",
    staffType: "cashier",
    authorityLevel: "user",
  });
  assert.deepEqual(staff.value, {
    role: "staff",
    authority_level: "user",
    staff_type: "cashier",
  });

  const invalidStaffManager = normalizeInternalAccess({
    role: "staff",
    staffType: "indoor",
    authorityLevel: "manager",
  });
  assert.match(invalidStaffManager.error, /Standard access/);

  const newManager = normalizeInternalAccess({
    role: "admin",
    staffType: "cashier",
  });
  assert.deepEqual(newManager.value, {
    role: "admin",
    authority_level: "manager",
    staff_type: null,
  });

  const superAdmin = normalizeInternalAccess({
    role: "admin",
    authorityLevel: "admin",
  });
  assert.equal(isSuperAdminAccount(superAdmin.value), true);
  assert.equal(isManagerAccount(newManager.value), true);
  assert.equal(isStandardStaffAccount(staff.value), true);

  assert.equal(canManageInternalAccount(newManager.value, staff.value), true);
  assert.equal(canManageInternalAccount(newManager.value, superAdmin.value), false);
  assert.equal(canCreateInternalAccount(newManager.value, staff.value), true);
  assert.equal(canCreateInternalAccount(newManager.value, newManager.value), false);
  assert.equal(canManageInternalAccount(superAdmin.value, newManager.value), true);

  assert.deepEqual(MODULE_ACTIONS.cancellations, ["view", "manage"]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(MODULE_ACTIONS, "cancellations_refunds"),
    false,
  );
  assert.deepEqual(AUTHORITY_DEFAULTS.manager.users, [
    "view",
    "create",
    "edit",
    "delete",
  ]);
  assert.deepEqual(AUTHORITY_DEFAULTS.manager.cancellations, ["view"]);
  assert.equal(POLICY_NOTES.managerUsesAdminRole, true);
  assert.equal(POLICY_NOTES.staffAuthorityIsUserOnly, true);

  console.log("✅ RBAC access model tests passed.");
}

run();
