ALTER TABLE users
MODIFY COLUMN otp_purpose ENUM(
    'verify_email',
    'forgot_password',
    'change_phone',
    'auth_current_phone',
    'auth_current_email',
    'password_reset'
) NULL;

CREATE TABLE IF NOT EXISTS user_password_history (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_user_password_history_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_user_password_history_user_created
        (user_id, created_at, id)
);