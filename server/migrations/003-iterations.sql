CREATE TABLE IF NOT EXISTS wb_iterations (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  goal VARCHAR(2000) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT '待开始',
  created_by VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  FOREIGN KEY (owner_id) REFERENCES wb_users(id),
  FOREIGN KEY (created_by) REFERENCES wb_users(id)
);
CREATE TABLE IF NOT EXISTS wb_iteration_items (
  work_id VARCHAR(64) PRIMARY KEY,
  iteration_id VARCHAR(64) NOT NULL,
  FOREIGN KEY (work_id) REFERENCES wb_works(id) ON DELETE CASCADE,
  FOREIGN KEY (iteration_id) REFERENCES wb_iterations(id) ON DELETE CASCADE
);
