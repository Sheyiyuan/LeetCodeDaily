CREATE TABLE activity_syncs (
  sync_id TEXT PRIMARY KEY,
  github_user_id INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  batch_count INTEGER NOT NULL CHECK (batch_count > 0 AND batch_count <= 1000),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (github_user_id)
    REFERENCES github_accounts(github_user_id)
    ON DELETE CASCADE
);

CREATE INDEX activity_syncs_expiry ON activity_syncs(expires_at);

CREATE TABLE activity_sync_batches (
  sync_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL CHECK (batch_index >= 0 AND batch_index < 1000),
  PRIMARY KEY (sync_id, batch_index),
  FOREIGN KEY (sync_id)
    REFERENCES activity_syncs(sync_id)
    ON DELETE CASCADE
);

CREATE TABLE activity_sync_days (
  sync_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  accepted_submission_count INTEGER NOT NULL CHECK (accepted_submission_count >= 0),
  distinct_problem_count INTEGER NOT NULL CHECK (distinct_problem_count >= 0),
  source_version INTEGER NOT NULL,
  PRIMARY KEY (sync_id, local_date),
  FOREIGN KEY (sync_id)
    REFERENCES activity_syncs(sync_id)
    ON DELETE CASCADE
);

CREATE TABLE activity_snapshot_states (
  github_user_id INTEGER PRIMARY KEY,
  applied_sync_id TEXT NOT NULL,
  applied_sync_created_at TEXT NOT NULL,
  FOREIGN KEY (github_user_id)
    REFERENCES github_accounts(github_user_id)
    ON DELETE CASCADE
);
