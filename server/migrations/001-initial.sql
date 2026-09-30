CREATE TABLE IF NOT EXISTS wb_users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  role VARCHAR(16) NOT NULL,
  access VARCHAR(16) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  color VARCHAR(16) NOT NULL DEFAULT 'blue',
  password_hash VARCHAR(200) NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS wb_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  csrf CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES wb_users(id) ON DELETE CASCADE,
  INDEX (expires_at)
);
CREATE TABLE IF NOT EXISTS wb_platforms (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(400) NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INT NOT NULL
);
CREATE TABLE IF NOT EXISTS wb_dictionary (
  id VARCHAR(64) PRIMARY KEY,
  group_key VARCHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INT NOT NULL,
  UNIQUE (group_key, name)
);
CREATE TABLE IF NOT EXISTS wb_sequences (kind VARCHAR(32) PRIMARY KEY, next_value BIGINT NOT NULL);
INSERT IGNORE INTO wb_sequences VALUES ('requirement',1),('task',1),('admin-lock',1),('settings-lock',1);
CREATE TABLE IF NOT EXISTS wb_works (
  id VARCHAR(64) PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(100) NOT NULL,
  status VARCHAR(16) NOT NULL,
  priority VARCHAR(2) NOT NULL,
  platform_id VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  requirement_id VARCHAR(64) NULL,
  manual_focus BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  due_at DATETIME NULL,
  started_at DATETIME NULL,
  document JSON NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  FOREIGN KEY (platform_id) REFERENCES wb_platforms(id),
  FOREIGN KEY (owner_id) REFERENCES wb_users(id),
  FOREIGN KEY (created_by) REFERENCES wb_users(id),
  FOREIGN KEY (requirement_id) REFERENCES wb_works(id),
  INDEX (kind, deleted_at, archived, status),
  INDEX (owner_id, kind), INDEX (platform_id, kind), INDEX (due_at), INDEX (updated_at)
);
CREATE TABLE IF NOT EXISTS wb_participants (
  work_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (work_id,user_id),
  FOREIGN KEY (work_id) REFERENCES wb_works(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES wb_users(id)
);
CREATE TABLE IF NOT EXISTS wb_files (
  id VARCHAR(64) PRIMARY KEY,
  uploader_id VARCHAR(64) NOT NULL,
  work_id VARCHAR(64) NULL,
  zone VARCHAR(16) NULL,
  name VARCHAR(200) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  contents MEDIUMBLOB NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (uploader_id) REFERENCES wb_users(id),
  FOREIGN KEY (work_id) REFERENCES wb_works(id) ON DELETE CASCADE,
  INDEX (work_id), INDEX (created_at)
);
CREATE TABLE IF NOT EXISTS wb_activities (
  id VARCHAR(64) PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  work_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  text VARCHAR(400) NOT NULL,
  changes JSON NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX (work_id,created_at)
);
CREATE TABLE IF NOT EXISTS wb_notices (
  id VARCHAR(64) PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  work_id VARCHAR(64) NOT NULL,
  recipient_id VARCHAR(64) NOT NULL,
  title VARCHAR(160) NOT NULL,
  text VARCHAR(600) NOT NULL,
  level VARCHAR(16) NOT NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  dedupe_key VARCHAR(200) NULL UNIQUE,
  FOREIGN KEY (recipient_id) REFERENCES wb_users(id),
  INDEX (recipient_id,read_at,created_at)
);
CREATE TABLE IF NOT EXISTS wb_audit (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) NULL,
  action VARCHAR(100) NOT NULL,
  target_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  INDEX (created_at)
);
