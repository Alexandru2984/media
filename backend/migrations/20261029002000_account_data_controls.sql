CREATE TABLE upload_deletion_queue (
    id VARCHAR(36) PRIMARY KEY NOT NULL,
    url VARCHAR(512) NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_attempt_at TIMESTAMP(6) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY unique_upload_deletion_url (url),
    INDEX idx_upload_deletion_ready (state, next_attempt_at, created_at),
    CONSTRAINT chk_upload_deletion_state CHECK (state IN ('pending', 'blocked'))
);
