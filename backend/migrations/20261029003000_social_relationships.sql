CREATE TABLE IF NOT EXISTS follows (
    follower_id VARCHAR(36) NOT NULL,
    followed_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (follower_id, followed_id),
    INDEX idx_follows_follower_created (follower_id, created_at, followed_id),
    INDEX idx_follows_followed_created (followed_id, created_at, follower_id),
    CONSTRAINT fk_follows_follower
        FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_follows_followed
        FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_follows_distinct_users CHECK (follower_id <> followed_id)
);

CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id VARCHAR(36) NOT NULL,
    blocked_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (blocker_id, blocked_id),
    INDEX idx_user_blocks_blocked (blocked_id, blocker_id),
    CONSTRAINT fk_user_blocks_blocker
        FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_blocks_blocked
        FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_user_blocks_distinct_users CHECK (blocker_id <> blocked_id)
);
