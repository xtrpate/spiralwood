CREATE TABLE paymongo_webhook_events (
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  livemode TINYINT(1) NOT NULL DEFAULT 0,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'processing',
  last_error TEXT NULL,

  PRIMARY KEY (event_id),
  INDEX idx_paymongo_webhook_events_status (status),
  INDEX idx_paymongo_webhook_events_received_at (received_at)
) ENGINE=InnoDB;