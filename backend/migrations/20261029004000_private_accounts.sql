ALTER TABLE users
    ADD COLUMN is_private TINYINT(1) NOT NULL DEFAULT 0 AFTER avatar_url;

CREATE TABLE follow_requests (
    requester_id VARCHAR(36) NOT NULL,
    target_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (requester_id, target_id),
    INDEX idx_follow_requests_target_created (target_id, created_at, requester_id),
    CONSTRAINT fk_follow_requests_requester
        FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_follow_requests_target
        FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_follow_requests_distinct_users CHECK (requester_id <> target_id)
);
