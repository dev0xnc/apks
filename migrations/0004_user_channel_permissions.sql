CREATE TABLE IF NOT EXISTS user_channel_permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, channel_id)
);
CREATE INDEX IF NOT EXISTS user_channel_permissions_user_idx ON user_channel_permissions(user_id);
CREATE TABLE IF NOT EXISTS user_channel_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
);
