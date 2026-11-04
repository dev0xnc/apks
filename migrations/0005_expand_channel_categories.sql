-- Expand the category allowlist used by per-user permissions.
CREATE TABLE user_category_permissions_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN (
    'general','sports','news','music','kids','movies','series',
    'documentary','entertainment','education','culture','lifestyle','religion'
  )),
  PRIMARY KEY(user_id, category)
);

INSERT INTO user_category_permissions_new(user_id, category)
SELECT user_id, category FROM user_category_permissions;

DROP TABLE user_category_permissions;
ALTER TABLE user_category_permissions_new RENAME TO user_category_permissions;

CREATE INDEX IF NOT EXISTS user_category_permissions_user_idx
ON user_category_permissions(user_id);
