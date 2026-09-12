-- ============================================================
-- WISDOM Migration 011
-- User-specific permission overrides
--
-- Purpose:
--   Allows an individual account to explicitly:
--     1. grant a permission
--     2. deny a permission
--     3. return to inherited/default behavior
--
-- Permission inheritance remains:
--   authority_permissions
--       +
--   role_permissions
--       +
--   user_permission_overrides
--
-- User-specific overrides take precedence over inherited
-- authority/role permissions.
--
-- No existing role, authority_level, permissions,
-- authority_permissions, or role_permissions columns are changed.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_permission_overrides (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,

    user_id INT NOT NULL,
    permission_id INT UNSIGNED NOT NULL,

    -- 1 = explicitly granted
    -- 0 = explicitly denied
    granted TINYINT(1) NOT NULL,

    -- The account that last changed this override.
    updated_by INT NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_user_permission_override (
        user_id,
        permission_id
    ),

    KEY idx_user_permission_overrides_user (
        user_id
    ),

    KEY idx_user_permission_overrides_permission (
        permission_id
    ),

    KEY idx_user_permission_overrides_updated_by (
        updated_by
    ),

    CONSTRAINT fk_user_permission_overrides_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_user_permission_overrides_permission
        FOREIGN KEY (permission_id)
        REFERENCES permissions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_user_permission_overrides_updated_by
        FOREIGN KEY (updated_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_user_permission_override_granted
        CHECK (granted IN (0, 1))

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;