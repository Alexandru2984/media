ALTER TABLE posts
    ADD COLUMN content_warning VARCHAR(100) NULL,
    ADD CONSTRAINT chk_posts_content_warning CHECK (
        content_warning IS NULL OR CHAR_LENGTH(TRIM(content_warning)) BETWEEN 1 AND 100
    );
