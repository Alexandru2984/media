CREATE TABLE user_mutes (
    muter_id VARCHAR(36) NOT NULL,
    muted_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (muter_id, muted_id),
    INDEX idx_user_mutes_muted (muted_id, muter_id),
    CONSTRAINT fk_user_mutes_muter
        FOREIGN KEY (muter_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_mutes_muted
        FOREIGN KEY (muted_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_user_mutes_distinct_users CHECK (muter_id <> muted_id)
);

CREATE TABLE hidden_posts (
    user_id VARCHAR(36) NOT NULL,
    post_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_id, post_id),
    INDEX idx_hidden_posts_user_created (user_id, created_at, post_id),
    INDEX idx_hidden_posts_post (post_id, user_id),
    CONSTRAINT fk_hidden_posts_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_hidden_posts_post
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE content_reports (
    id VARCHAR(36) NOT NULL,
    reporter_id VARCHAR(36) NOT NULL,
    target_type VARCHAR(16) NOT NULL,
    target_key VARCHAR(48) NOT NULL,
    target_user_id VARCHAR(36) NULL,
    target_post_id VARCHAR(36) NULL,
    target_comment_id VARCHAR(36) NULL,
    reason VARCHAR(32) NOT NULL,
    details VARCHAR(1000) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_content_reports_reporter_target (reporter_id, target_key),
    INDEX idx_content_reports_reporter_created (reporter_id, created_at, id),
    INDEX idx_content_reports_target_user (target_user_id),
    INDEX idx_content_reports_target_post (target_post_id),
    INDEX idx_content_reports_target_comment (target_comment_id),
    CONSTRAINT fk_content_reports_reporter
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_content_reports_target_user
        FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_content_reports_target_post
        FOREIGN KEY (target_post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_content_reports_target_comment
        FOREIGN KEY (target_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    CONSTRAINT chk_content_reports_type CHECK (
        target_type IN ('user', 'post', 'comment')
    ),
    CONSTRAINT chk_content_reports_reason CHECK (
        reason IN (
            'spam', 'harassment', 'hate', 'violence', 'sexual',
            'self_harm', 'impersonation', 'privacy', 'illegal', 'other'
        )
    ),
    CONSTRAINT chk_content_reports_target_shape CHECK (
        (target_type = 'user' AND target_user_id IS NOT NULL
            AND target_post_id IS NULL AND target_comment_id IS NULL)
        OR (target_type = 'post' AND target_user_id IS NULL
            AND target_post_id IS NOT NULL AND target_comment_id IS NULL)
        OR (target_type = 'comment' AND target_user_id IS NULL
            AND target_post_id IS NULL AND target_comment_id IS NOT NULL)
    )
);

-- Submission events are deliberately separate from withdrawable reports so a
-- user cannot evade the rolling abuse limit by immediately withdrawing each one.
CREATE TABLE report_submission_events (
    id VARCHAR(36) NOT NULL,
    reporter_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX idx_report_events_reporter_created (reporter_id, created_at, id),
    CONSTRAINT fk_report_events_reporter
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);
