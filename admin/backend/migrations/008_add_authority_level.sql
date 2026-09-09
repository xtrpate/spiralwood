ALTER TABLE users
  ADD COLUMN authority_level ENUM('user', 'manager', 'admin')
    NOT NULL DEFAULT 'user'
    AFTER role;

-- Preserve the existing administrator accounts.
UPDATE users
SET authority_level = 'admin'
WHERE role = 'admin';

-- All other existing accounts remain at the least-privileged authority.
UPDATE users
SET authority_level = 'user'
WHERE authority_level IS NULL;