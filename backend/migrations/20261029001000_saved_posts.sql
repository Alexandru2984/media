CREATE TABLE saved_posts (
    user_id VARCHAR(36) NOT NULL,
    post_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_id, post_id),
    INDEX idx_saved_posts_user_created (user_id, created_at DESC),
    INDEX idx_saved_posts_post (post_id),
    CONSTRAINT fk_saved_posts_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_saved_posts_post
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
