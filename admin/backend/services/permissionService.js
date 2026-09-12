const pool = require("../config/db");
const { NEVER_GRANT } = require("../config/permissionMatrix");

const normalizePermissionKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeAuthority = (value) =>
  String(value || "user")
    .trim()
    .toLowerCase();

const normalizeRole = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeStaffType = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return normalized || null;
};

/**
 * Returns the full permission state for one user.
 *
 * Base permissions:
 *   1. authority_permissions
 *   2. role_permissions
 *
 * User-specific overrides are then applied:
 *   granted = 1 → force grant
 *   granted = 0 → force deny
 *
 * NEVER_GRANT permissions always remain blocked.
 */
const getPermissionDetailsForUser = async (user) => {
  if (!user) {
    return {
      permissions: [],
      overrides: [],
    };
  }

  const authority = normalizeAuthority(user.authority_level);
  const role = normalizeRole(user.role);
  const staffType = normalizeStaffType(user.staff_type);

  const [authorityRows] = await pool.query(
    `
      SELECT DISTINCT
        p.id,
        p.permission_key,
        p.description,
        p.module
      FROM authority_permissions ap
      INNER JOIN permissions p
        ON p.id = ap.permission_id
      WHERE ap.authority_level = ?
    `,
    [authority],
  );

  let roleQuery = `
    SELECT DISTINCT
      p.id,
      p.permission_key,
      p.description,
      p.module
    FROM role_permissions rp
    INNER JOIN permissions p
      ON p.id = rp.permission_id
    WHERE rp.role = ?
  `;

  const roleParams = [role];

  if (role === "staff") {
    roleQuery += `
      AND (
        rp.staff_type IS NULL
        OR rp.staff_type = ?
      )
    `;

    roleParams.push(staffType);
  } else {
    roleQuery += `
      AND rp.staff_type IS NULL
    `;
  }

  const [roleRows] = await pool.query(roleQuery, roleParams);

  const [overrideRows] = await pool.query(
    `
      SELECT
        upo.permission_id,
        upo.granted,
        p.permission_key
      FROM user_permission_overrides upo
      INNER JOIN permissions p
        ON p.id = upo.permission_id
      WHERE upo.user_id = ?
    `,
    [user.id],
  );

  const blocked = new Set(NEVER_GRANT.map(normalizePermissionKey));

  const basePermissionIds = new Set();
  const basePermissions = new Map();

  for (const row of [...authorityRows, ...roleRows]) {
    const key = normalizePermissionKey(row.permission_key);

    if (!key) continue;
    if (blocked.has(key)) continue;

    basePermissionIds.add(Number(row.id));
    basePermissions.set(Number(row.id), row);
  }

  const overrides = [];

  for (const row of overrideRows) {
    const permissionId = Number(row.permission_id);
    const key = normalizePermissionKey(row.permission_key);

    if (!key) continue;
    if (blocked.has(key)) continue;

    overrides.push({
      permission_id: permissionId,
      permission_key: key,
      granted: Number(row.granted) === 1,
    });
  }

  const overrideMap = new Map(
    overrides.map((item) => [item.permission_id, item.granted]),
  );

  const allPermissionRows = new Map();

  for (const row of [...authorityRows, ...roleRows]) {
    allPermissionRows.set(Number(row.id), row);
  }

  for (const row of overrideRows) {
    allPermissionRows.set(Number(row.permission_id), {
      id: Number(row.permission_id),
      permission_key: row.permission_key,
    });
  }

  const effective = new Set();

  for (const permissionId of basePermissionIds) {
    const override = overrideMap.get(permissionId);

    if (override === false) {
      continue;
    }

    effective.add(
      normalizePermissionKey(
        allPermissionRows.get(permissionId)?.permission_key,
      ),
    );
  }

  for (const [permissionId, granted] of overrideMap.entries()) {
    if (!granted) continue;

    const row = allPermissionRows.get(permissionId);

    if (!row) continue;

    const key = normalizePermissionKey(row.permission_key);

    if (!key) continue;
    if (blocked.has(key)) continue;

    effective.add(key);
  }

  return {
    permissions: [...effective].filter(Boolean).sort(),

    overrides: overrides.sort((a, b) =>
      a.permission_key.localeCompare(b.permission_key),
    ),

    basePermissionIds: [...basePermissionIds].sort((a, b) => a - b),
  };
};

/**
 * Backward-compatible helper used by login/authentication.
 */
const getEffectivePermissionsForUser = async (user) => {
  const result = await getPermissionDetailsForUser(user);
  return result.permissions;
};

module.exports = {
  getEffectivePermissionsForUser,
  getPermissionDetailsForUser,
};
