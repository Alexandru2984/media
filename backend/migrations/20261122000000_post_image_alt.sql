-- Additive: prior API binaries can continue to read/write posts unchanged.
-- Descriptions inherit the parent post's current audience and deletion policy.
ALTER TABLE posts
    ADD COLUMN image_alt VARCHAR(300) NULL AFTER image_url,
    ADD CONSTRAINT chk_posts_image_alt
        CHECK (image_alt IS NULL OR (image_url IS NOT NULL AND CHAR_LENGTH(image_alt) > 0));

-- Older API binaries do not know image_alt. Clear an old description if those
-- clients remove/replace its image. New replacements explicitly clear the old
-- description before writing the new pair inside the same transaction.
CREATE TRIGGER posts_image_alt_cleanup
BEFORE UPDATE ON posts FOR EACH ROW
SET NEW.image_alt = CASE
    WHEN NEW.image_url IS NULL THEN NULL
    WHEN NEW.image_url <=> OLD.image_url THEN NEW.image_alt
    WHEN NEW.image_alt <=> OLD.image_alt THEN NULL
    ELSE NEW.image_alt
END;
