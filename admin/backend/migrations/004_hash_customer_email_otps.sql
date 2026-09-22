-- Migration: 004_hash_customer_email_otps.sql
-- Email verification and password-reset OTPs were previously stored as
-- plaintext six-digit values. Store bcrypt hashes instead.

ALTER TABLE users
  MODIFY COLUMN otp_code VARCHAR(255) NULL;
