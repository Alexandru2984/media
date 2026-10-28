CREATE TABLE managed_uploads (
    id VARCHAR(36) PRIMARY KEY NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    url VARCHAR(512) NOT NULL,
    kind VARCHAR(16) NOT NULL,
    state VARCHAR(16) NOT NULL,
    size_bytes BIGINT NOT NULL,
    post_id VARCHAR(36),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attached_at TIMESTAMP NULL,
    UNIQUE KEY unique_managed_upload_url (url),
    UNIQUE KEY unique_managed_upload_post (post_id),
    INDEX idx_managed_upload_user_state (user_id, state, created_at),
    INDEX idx_managed_upload_state_created (state, created_at),
    CONSTRAINT fk_managed_upload_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_managed_upload_post
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
    CONSTRAINT chk_managed_upload_kind CHECK (kind IN ('avatar', 'post')),
    CONSTRAINT chk_managed_upload_state
        CHECK (state IN ('writing', 'pending', 'attached', 'deleting')),
    CONSTRAINT chk_managed_upload_size CHECK (size_bytes > 0)
);
