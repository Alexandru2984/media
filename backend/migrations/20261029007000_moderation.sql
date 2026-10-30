ALTER TABLE users
    ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user' AFTER is_private,
    ADD CONSTRAINT chk_users_role CHECK (role IN ('user', 'moderator', 'admin'));

ALTER TABLE content_reports
    DROP FOREIGN KEY fk_content_reports_target_user,
    DROP FOREIGN KEY fk_content_reports_target_post,
    DROP FOREIGN KEY fk_content_reports_target_comment,
    DROP CONSTRAINT chk_content_reports_target_shape,
    DROP INDEX uq_content_reports_reporter_target,
    ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'open' AFTER details,
    ADD COLUMN active_marker TINYINT NULL DEFAULT 1 AFTER status,
    ADD COLUMN target_label_snapshot VARCHAR(255) NULL AFTER target_key,
    ADD COLUMN target_excerpt_snapshot VARCHAR(2000) NULL AFTER target_label_snapshot,
    ADD COLUMN target_actor_reference VARCHAR(36) NULL AFTER target_excerpt_snapshot,
    ADD COLUMN assigned_moderator_id VARCHAR(36) NULL AFTER active_marker,
    ADD COLUMN resolution_note VARCHAR(1000) NULL AFTER assigned_moderator_id,
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) AFTER created_at,
    ADD COLUMN reviewed_at TIMESTAMP(6) NULL AFTER updated_at;

UPDATE content_reports report
LEFT JOIN users target_user ON target_user.id = report.target_user_id
LEFT JOIN posts target_post ON target_post.id = report.target_post_id
LEFT JOIN users post_author ON post_author.id = target_post.user_id
LEFT JOIN comments target_comment ON target_comment.id = report.target_comment_id
LEFT JOIN users comment_author ON comment_author.id = target_comment.user_id
SET report.target_label_snapshot = COALESCE(
        target_user.username,
        post_author.username,
        comment_author.username,
        'Conținut indisponibil'
    ),
    report.target_excerpt_snapshot = CASE report.target_type
        WHEN 'user' THEN target_user.bio
        WHEN 'post' THEN LEFT(target_post.content, 2000)
        WHEN 'comment' THEN LEFT(target_comment.content, 2000)
        ELSE NULL
    END,
    report.target_actor_reference = COALESCE(
        report.target_user_id,
        target_post.user_id,
        target_comment.user_id
    ),
    report.updated_at = report.created_at;

ALTER TABLE content_reports
    MODIFY COLUMN target_label_snapshot VARCHAR(255) NOT NULL,
    MODIFY COLUMN target_actor_reference VARCHAR(36) NOT NULL,
    ADD UNIQUE KEY uq_content_reports_active_target
        (reporter_id, target_key, active_marker),
    ADD INDEX idx_content_reports_queue (status, updated_at, id),
    ADD INDEX idx_content_reports_assignee
        (assigned_moderator_id, status, updated_at, id),
    ADD INDEX idx_content_reports_actor
        (target_actor_reference, status, updated_at, id),
    ADD CONSTRAINT fk_content_reports_target_user
        FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_content_reports_target_post
        FOREIGN KEY (target_post_id) REFERENCES posts(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_content_reports_target_comment
        FOREIGN KEY (target_comment_id) REFERENCES comments(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_content_reports_assigned_moderator
        FOREIGN KEY (assigned_moderator_id) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT chk_content_reports_status CHECK (
        status IN ('open', 'reviewing', 'resolved', 'dismissed', 'withdrawn')
    ),
    ADD CONSTRAINT chk_content_reports_active_state CHECK (
        (status IN ('open', 'reviewing') AND active_marker = 1)
        OR (status IN ('resolved', 'dismissed', 'withdrawn') AND active_marker IS NULL)
    ),
    ADD CONSTRAINT chk_content_reports_assignment CHECK (
        (status IN ('open', 'reviewing') AND reviewed_at IS NULL)
        OR status = 'withdrawn'
        OR (status IN ('resolved', 'dismissed') AND reviewed_at IS NOT NULL)
    );

CREATE TABLE moderation_audit_events (
    id VARCHAR(36) NOT NULL,
    report_id VARCHAR(36) NULL,
    report_reference VARCHAR(36) NOT NULL,
    moderator_id VARCHAR(36) NULL,
    action VARCHAR(32) NOT NULL,
    previous_status VARCHAR(16) NOT NULL,
    new_status VARCHAR(16) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX idx_moderation_audit_created (created_at, id),
    INDEX idx_moderation_audit_report (report_reference, created_at, id),
    INDEX idx_moderation_audit_moderator (moderator_id, created_at, id),
    CONSTRAINT fk_moderation_audit_report
        FOREIGN KEY (report_id) REFERENCES content_reports(id) ON DELETE SET NULL,
    CONSTRAINT fk_moderation_audit_moderator
        FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_moderation_audit_action CHECK (
        action IN ('report_claimed', 'report_released', 'report_resolved', 'report_dismissed')
    ),
    CONSTRAINT chk_moderation_audit_previous_status CHECK (
        previous_status IN ('open', 'reviewing')
    ),
    CONSTRAINT chk_moderation_audit_new_status CHECK (
        new_status IN ('open', 'reviewing', 'resolved', 'dismissed')
    )
);
