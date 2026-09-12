const pool = require("../config/db");
const { writeAuditLogSafe } = require("./auditLog");
const { NEVER_GRANT } = require("../config/permissionMatrix");

/**
 * Normalize a permission key so all callers use the same format.
 */
function normalizePermissionKey(permissionKey) {
  return String(permissionKey || "")
    .trim()
    .toLowerCase();
}

/**
 * Build the effective permission set from:
 *
 *   authority_permissions
 *       UNION
 *   role_permissions
 *
 * Role permissions are additive to authority permissions.
 */
function buildEffectivePermissionSet(authorityPermissions, rolePermissions) {
  const blockedPermissions = new Set(NEVER_GRANT.map(normalizePermissionKey));

  const effectivePermissions = new Set();

  for (const permission of [
    ...(authorityPermissions || []),
    ...(rolePermissions || []),
  ]) {
    const key = normalizePermissionKey(
      typeof permission === "string" ? permission : permission.permission_key,
    );

    if (!key) continue;
    if (blockedPermissions.has(key)) continue;

    effectivePermissions.add(key);
  }

  return effectivePermissions;
}

/**
 * Pure permission check.
 *
 * Exported separately so it can be unit-tested without a database.
 */
function hasPermission(permissionSet, permissionKey) {
  const key = normalizePermissionKey(permissionKey);

  if (!key) return false;

  if (NEVER_GRANT.some((blocked) => normalizePermissionKey(blocked) === key)) {
    return false;
  }

  return permissionSet instanceof Set && permissionSet.has(key);
}

/**
 * Create the middleware with injectable dependencies.
 *
 * The application uses the real pool/audit logger.
 * Tests can provide lightweight fakes.
 */
function createRequirePermissionMiddleware({
  dbPool = pool,
  auditLogger = writeAuditLogSafe,
} = {}) {
  return function requirePermission(permissionKey) {
    const normalizedPermission = normalizePermissionKey(permissionKey);

    return async (req, res, next) => {
      // Permission checks must run only after authenticate().
      if (!req.user) {
        return res.status(401).json({
          message: "Authentication required.",
        });
      }

      if (!normalizedPermission) {
        return res.status(500).json({
          message: "Invalid permission configuration.",
        });
      }

      // Never-grant permissions are rejected regardless of DB contents.
      if (
        NEVER_GRANT.some(
          (blocked) => normalizePermissionKey(blocked) === normalizedPermission,
        )
      ) {
        await auditLogger({
          userId: req.user.id,
          action: "permission_denied",
          tableName: "security",
          recordId: req.user.id,
          newValues: {
            permission_key: normalizedPermission,
            authority_level: req.user.authority_level || "user",
            user_role: req.user.role || null,
            staff_type: req.user.staff_type || null,
            reason: "never_grant_permission",
            request_method: req.method,
            request_path: String(req.originalUrl || req.path || "").split(
              "?",
            )[0],
          },
          ipAddress: req.ip || null,
        });

        return res.status(403).json({
          message: "Forbidden. This permission is permanently restricted.",
        });
      }

      const authority = String(req.user.authority_level || "user")
        .trim()
        .toLowerCase();

      const role = String(req.user.role || "")
        .trim()
        .toLowerCase();

      const staffType = req.user.staff_type
        ? String(req.user.staff_type).trim().toLowerCase()
        : null;

      try {
        // ---------------------------------------------------------
        // 1. Authority-level permissions
        // ---------------------------------------------------------
        const [authorityRows] = await dbPool.query(
          `
          SELECT p.permission_key
          FROM authority_permissions ap
          INNER JOIN permissions p
            ON p.id = ap.permission_id
          WHERE ap.authority_level = ?
            AND p.permission_key = ?
          LIMIT 1
          `,
          [authority, normalizedPermission],
        );

        // ---------------------------------------------------------
        // 2. Role / staff-type permissions
        // ---------------------------------------------------------
        const roleParams = [role, normalizedPermission];

        let roleQuery = `
          SELECT p.permission_key
          FROM role_permissions rp
          INNER JOIN permissions p
            ON p.id = rp.permission_id
          WHERE rp.role = ?
            AND p.permission_key = ?
        `;

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

        roleQuery += " LIMIT 1";

        const [roleRows] = await dbPool.query(roleQuery, roleParams);

        const [overrideRows] = await dbPool.query(
          `
    SELECT upo.granted
    FROM user_permission_overrides upo
    INNER JOIN permissions p
      ON p.id = upo.permission_id
    WHERE upo.user_id = ?
      AND p.permission_key = ?
    LIMIT 1
  `,
          [req.user.id, normalizedPermission],
        );

        const effectivePermissions = buildEffectivePermissionSet(
          authorityRows,
          roleRows,
        );

        const hasUserOverride = overrideRows.length > 0;
        const userOverrideGranted = hasUserOverride
          ? Number(overrideRows[0].granted) === 1
          : null;

        const permissionAllowed = hasUserOverride
          ? userOverrideGranted
          : hasPermission(effectivePermissions, normalizedPermission);

        if (!permissionAllowed) {
          await auditLogger({
            userId: req.user.id,
            action: "permission_denied",
            tableName: "security",
            recordId: req.user.id,
            newValues: {
              permission_key: normalizedPermission,
              authority_level: authority,
              user_role: role || null,
              staff_type: staffType,
              reason: "permission_not_granted",
              request_method: req.method,
              request_path: String(req.originalUrl || req.path || "").split(
                "?",
              )[0],
            },
            ipAddress: req.ip || null,
          });

          return res.status(403).json({
            message: "Forbidden. You lack the required permission.",
          });
        }

        next();
      } catch (err) {
        console.error("[requirePermission]", err);

        return res.status(500).json({
          message: "Unable to verify permissions.",
        });
      }
    };
  };
}

const requirePermission = createRequirePermissionMiddleware();

module.exports = {
  requirePermission,
  createRequirePermissionMiddleware,
  buildEffectivePermissionSet,
  hasPermission,
};
