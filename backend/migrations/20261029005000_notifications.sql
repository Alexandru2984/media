CREATE TABLE notifications (
    id VARCHAR(36) NOT NULL,
    recipient_id VARCHAR(36) NOT NULL,
    actor_id VARCHAR(36) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    post_id VARCHAR(36) NULL,
    event_key VARCHAR(128) NOT NULL,
    read_at TIMESTAMP(6) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_notifications_recipient_event (recipient_id, event_key),
    INDEX idx_notifications_recipient_created (recipient_id, created_at, id),
    INDEX idx_notifications_actor_recipient (actor_id, recipient_id),
    INDEX idx_notifications_post (post_id),
    CONSTRAINT fk_notifications_recipient
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_actor
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_post
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT chk_notifications_distinct_users CHECK (recipient_id <> actor_id),
    CONSTRAINT chk_notifications_kind CHECK (
        kind IN ('follow_request', 'follow_accepted', 'new_follower', 'post_like', 'post_comment')
    ),
    CONSTRAINT chk_notifications_post_shape CHECK (
        (kind IN ('post_like', 'post_comment') AND post_id IS NOT NULL)
        OR (kind IN ('follow_request', 'follow_accepted', 'new_follower') AND post_id IS NULL)
    )
);
