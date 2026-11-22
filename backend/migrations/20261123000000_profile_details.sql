-- Optional public profile metadata. Existing binaries can keep editing users.
CREATE TABLE profile_details (
    user_id VARCHAR(36) PRIMARY KEY NOT NULL,
    display_name VARCHAR(50) NULL,
    pronouns VARCHAR(30) NULL,
    location VARCHAR(80) NULL,
    website_url VARCHAR(512) NULL,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_profile_details_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
);
