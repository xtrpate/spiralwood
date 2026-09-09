/**
 * WISDOM Permission Matrix
 *
 * PART A — Permission Policy / Specification
 *
 * IMPORTANT:
 * - This file is currently a definition of the permission policy.
 * - It is NOT authorization middleware.
 * - Do NOT use this file to grant/deny API access yet.
 * - Backend enforcement will be implemented in Part C.
 *
 * Concepts:
 * role            = account/job type
 * authority_level = authority tier
 * permission      = specific capability
 */

const AUTHORITY_LEVELS = Object.freeze(["user", "manager", "admin"]);

const ROLES = Object.freeze(["staff", "customer"]);

const STAFF_TYPES = Object.freeze(["cashier", "indoor", "delivery_rider"]);

const ACTIONS = Object.freeze([
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "manage",
  "authority",
]);

/**
 * Step 1
 *
 * Actions that make sense for each WISDOM module.
 */
const MODULE_ACTIONS = Object.freeze({
  dashboard: ["view"],

  products: ["view", "create", "edit", "delete", "manage"],

  raw_materials: ["view", "create", "edit", "delete", "manage"],

  build_materials: ["view", "create", "edit", "delete", "manage"],

  suppliers: ["view", "create", "edit", "delete", "manage"],

  stock_movements: ["view", "create", "edit", "manage", "export"],

  orders: ["view", "create", "edit", "manage", "export"],

  cancellations_refunds: ["view", "manage", "export"],

  pos_qr_recovery: ["view", "manage"],

  task_assignments: ["view", "create", "edit", "manage"],

  appointments: ["view", "create", "edit", "manage", "delete"],

  delivery_scheduling: ["view", "create", "edit", "manage"],

  blueprint_management: [
    "view",
    "create",
    "edit",
    "delete",
    "manage",
    "export",
  ],

  contracts: ["view", "create", "edit", "delete", "manage", "export"],

  warranty: ["view", "create", "edit", "manage", "export"],

  support: ["view", "create", "edit", "manage", "delete"],

  sales_report: ["view", "export"],

  customers: ["view", "create", "edit", "manage", "delete", "export"],

  users: ["view", "create", "edit", "delete", "manage", "authority"],

  audit_logs: ["view", "export"],

  site_settings: ["view", "edit", "manage"],

  faqs: ["view", "create", "edit", "delete", "manage"],

  page_content: ["view", "create", "edit", "delete", "manage"],

  backup: ["view", "create", "manage"],
});

/**
 * Step 2
 *
 * Default authority-level policy.
 *
 * true  = permission is granted by default
 * false = permission is not granted by default
 *
 * Role-specific restrictions are applied separately below.
 */
const AUTHORITY_DEFAULTS = Object.freeze({
  user: {
    dashboard: ["view"],

    products: ["view"],
    raw_materials: ["view"],
    build_materials: ["view"],
    suppliers: ["view"],
    stock_movements: ["view"],
    orders: ["view"],

    cancellations_refunds: [],
    pos_qr_recovery: [],

    task_assignments: ["view"],
    appointments: ["view"],
    delivery_scheduling: ["view"],

    blueprint_management: ["view"],

    contracts: [],
    warranty: ["view"],
    support: ["view"],

    sales_report: [],
    customers: [],

    users: [],
    audit_logs: [],

    site_settings: [],
    faqs: [],
    page_content: [],
    backup: [],
  },

  manager: {
    dashboard: ["view"],

    products: ["view", "create", "edit", "delete", "manage"],
    raw_materials: ["view", "create", "edit", "delete", "manage"],
    build_materials: ["view", "create", "edit", "delete", "manage"],
    suppliers: ["view", "create", "edit", "delete", "manage"],

    stock_movements: ["view", "create", "edit", "manage", "export"],

    orders: ["view", "create", "edit", "manage", "export"],

    cancellations_refunds: ["view", "manage", "export"],

    pos_qr_recovery: ["view", "manage"],

    task_assignments: ["view", "create", "edit", "manage"],

    appointments: ["view", "create", "edit", "manage"],

    delivery_scheduling: ["view", "create", "edit", "manage"],

    blueprint_management: [
      "view",
      "create",
      "edit",
      "delete",
      "manage",
      "export",
    ],

    contracts: ["view", "create", "edit", "delete", "manage", "export"],

    warranty: ["view", "create", "edit", "manage", "export"],

    support: ["view", "create", "edit", "manage", "delete"],

    sales_report: ["view", "export"],

    // Confirmed by your decision:
    customers: ["view", "create", "edit", "manage", "delete", "export"],

    users: ["view", "create", "edit", "delete", "manage", "authority"],

    audit_logs: ["view", "export"],

    site_settings: [],
    faqs: [],
    page_content: [],
    backup: [],
  },

  admin: {
    dashboard: ["view"],

    products: ["view", "create", "edit", "delete", "manage"],
    raw_materials: ["view", "create", "edit", "delete", "manage"],
    build_materials: ["view", "create", "edit", "delete", "manage"],
    suppliers: ["view", "create", "edit", "delete", "manage"],

    stock_movements: ["view", "create", "edit", "manage", "export"],

    orders: ["view", "create", "edit", "manage", "export"],

    cancellations_refunds: ["view", "manage", "export"],

    pos_qr_recovery: ["view", "manage"],

    task_assignments: ["view", "create", "edit", "manage"],

    appointments: ["view", "create", "edit", "manage", "delete"],

    delivery_scheduling: ["view", "create", "edit", "manage"],

    blueprint_management: [
      "view",
      "create",
      "edit",
      "delete",
      "manage",
      "export",
    ],

    contracts: ["view", "create", "edit", "delete", "manage", "export"],

    warranty: ["view", "create", "edit", "manage", "export"],

    support: ["view", "create", "edit", "manage", "delete"],

    sales_report: ["view", "export"],

    customers: ["view", "create", "edit", "manage", "delete", "export"],

    users: ["view", "create", "edit", "delete", "manage", "authority"],

    audit_logs: ["view", "export"],

    site_settings: ["view", "edit", "manage"],

    faqs: ["view", "create", "edit", "delete", "manage"],

    page_content: ["view", "create", "edit", "delete", "manage"],

    backup: ["view", "create", "manage"],
  },
});

/**
 * Step 3
 *
 * Role-specific overlays.
 *
 * These intentionally follow the current WISDOM job/function model.
 * The exact existing API/sidebar behavior will be preserved and
 * converted into explicit role_permissions during Part B.
 *
 * NOTE:
 * This is a policy definition only. It is not being enforced yet.
 */
const ROLE_DEFAULTS = Object.freeze({
  customer: {
    dashboard: ["view"],

    products: ["view"],

    orders: ["create", "view"],

    customers: ["view"],

    appointments: ["create", "view"],

    support: ["create", "view"],

    warranty: ["create", "view"],
  },

  cashier: {
    dashboard: ["view"],

    products: ["view"],

    orders: ["view", "manage"],

    customers: ["view"],

    sales_report: ["view", "export"],

    stock_movements: ["view"],
  },

  indoor: {
    dashboard: ["view"],

    products: ["view"],

    orders: ["view", "manage"],

    task_assignments: ["view", "manage"],

    appointments: ["view", "manage"],

    blueprint_management: ["view", "create", "edit", "manage"],

    contracts: ["view"],

    warranty: ["view"],

    support: ["view"],
  },

  delivery_rider: {
    dashboard: ["view"],

    orders: ["view"],

    task_assignments: ["view", "manage"],

    delivery_scheduling: ["view", "manage"],

    customers: ["view"],
  },
});

/**
 * Step 4
 *
 * Permanently restricted permissions.
 *
 * These MUST NOT be granted to any authority level.
 */
const NEVER_GRANT = Object.freeze([
  "audit_logs.create",
  "audit_logs.edit",
  "audit_logs.delete",

  "users.change_own_authority",

  // Explicitly prohibited manager escalation.
  "users.authority.admin",
]);

/**
 * Step 5
 *
 * Human-readable policy notes.
 */
const POLICY_NOTES = Object.freeze({
  authorityHierarchy: ["user < manager < admin"],

  roleAndAuthorityAreIndependent: true,

  auditLogsAreImmutable: true,

  managerCannotAssignAdmin: true,

  userCannotChangeOwnAuthority: true,

  adminIsHighestAuthority: true,

  superAdminExcluded: true,

  customersAreManagedByManagers: true,

  cancellationsAndRefundsAreAvailableToManagers: true,

  posQrRecoveryIsAvailableToManagers: true,

  staffSubtypePermissionsFollowExistingWISDOMFunctions: true,
});

module.exports = {
  AUTHORITY_LEVELS,
  ROLES,
  STAFF_TYPES,
  ACTIONS,
  MODULE_ACTIONS,
  AUTHORITY_DEFAULTS,
  ROLE_DEFAULTS,
  NEVER_GRANT,
  POLICY_NOTES,
};
