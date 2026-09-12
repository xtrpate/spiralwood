-- ============================================================
-- WISDOM Migration 012
-- Make audit_logs immutable
--
-- Audit records may be created, but must never be modified
-- or deleted through SQL UPDATE/DELETE operations.
--
-- No existing audit rows are changed.
-- ============================================================

DROP TRIGGER IF EXISTS audit_logs_prevent_update;

DROP TRIGGER IF EXISTS audit_logs_prevent_delete;

DELIMITER $$

CREATE TRIGGER audit_logs_prevent_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT =
            'Audit logs are immutable and cannot be updated.';
END$$

CREATE TRIGGER audit_logs_prevent_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT =
            'Audit logs are immutable and cannot be deleted.';
END$$

DELIMITER ;