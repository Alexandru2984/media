CREATE TABLE notification_preferences (
    user_id VARCHAR(36) NOT NULL,
    notify_follow_requests BOOLEAN NOT NULL DEFAULT TRUE,
    notify_follow_acceptances BOOLEAN NOT NULL DEFAULT TRUE,
    notify_new_followers BOOLEAN NOT NULL DEFAULT TRUE,
    notify_post_likes BOOLEAN NOT NULL DEFAULT TRUE,
    notify_post_comments BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_id),
    CONSTRAINT fk_notification_preferences_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_notification_preferences_booleans CHECK (
        notify_follow_requests IN (FALSE, TRUE)
        AND notify_follow_acceptances IN (FALSE, TRUE)
        AND notify_new_followers IN (FALSE, TRUE)
        AND notify_post_likes IN (FALSE, TRUE)
        AND notify_post_comments IN (FALSE, TRUE)
    )
);
