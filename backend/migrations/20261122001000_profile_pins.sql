-- Additive: prior binaries keep working; deleting a post/account cascades pins.
ALTER TABLE posts ADD UNIQUE INDEX uq_posts_id_owner (id, user_id);
CREATE TABLE profile_pins (
    user_id VARCHAR(36) PRIMARY KEY NOT NULL,
    post_id VARCHAR(36) NOT NULL,
    pinned_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_profile_pin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_profile_pin_owned_post FOREIGN KEY (post_id, user_id)
        REFERENCES posts(id, user_id) ON DELETE CASCADE
);
