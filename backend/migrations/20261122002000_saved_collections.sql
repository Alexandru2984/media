-- Additive. Existing saved_posts and prior binaries remain compatible.
CREATE TABLE saved_collections (
    id VARCHAR(36) PRIMARY KEY NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    name VARCHAR(60) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE INDEX uq_saved_collection_owner (id, user_id),
    UNIQUE INDEX uq_saved_collection_name (user_id, name),
    CONSTRAINT fk_saved_collection_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_saved_collection_name CHECK (CHAR_LENGTH(name) BETWEEN 1 AND 60)
);

-- One optional folder per bookmark. Removing a folder only removes assignments;
-- removing a saved post through either binary also removes its assignment.
CREATE TABLE saved_collection_posts (
    user_id VARCHAR(36) NOT NULL,
    post_id VARCHAR(36) NOT NULL,
    collection_id VARCHAR(36) NOT NULL,
    assigned_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_id, post_id),
    INDEX idx_saved_collection_posts_collection (collection_id, user_id),
    CONSTRAINT fk_saved_collection_post_saved FOREIGN KEY (user_id, post_id)
        REFERENCES saved_posts(user_id, post_id) ON DELETE CASCADE,
    CONSTRAINT fk_saved_collection_post_owner FOREIGN KEY (collection_id, user_id)
        REFERENCES saved_collections(id, user_id) ON DELETE CASCADE
);
