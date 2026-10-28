CREATE TABLE IF NOT EXISTS security_events (
    id VARCHAR(36) PRIMARY KEY NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    event_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    occurred_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_time
    ON security_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_time
    ON security_events(occurred_at);
