CREATE TABLE IF NOT EXISTS user_category_permissions (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, category TEXT NOT NULL CHECK(category IN ('general','sports','news','entertainment','education','culture','music','religion')), PRIMARY KEY(user_id, category));
CREATE INDEX IF NOT EXISTS user_category_permissions_user_idx ON user_category_permissions(user_id);
