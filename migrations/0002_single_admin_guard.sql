CREATE TRIGGER IF NOT EXISTS prevent_second_admin
BEFORE INSERT ON users
WHEN NEW.role='admin' AND EXISTS(SELECT 1 FROM users WHERE role='admin')
BEGIN
  SELECT RAISE(ABORT, 'admin_already_exists');
END;
