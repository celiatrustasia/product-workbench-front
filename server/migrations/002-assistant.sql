CREATE TABLE IF NOT EXISTS wb_assistant_requests (
  user_id VARCHAR(64) NOT NULL,
  request_id CHAR(36) NOT NULL,
  input_hash CHAR(64) NOT NULL,
  state VARCHAR(16) NOT NULL,
  response JSON NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES wb_users(id) ON DELETE CASCADE
);
