PRAGMA foreign_keys = ON;

CREATE TABLE github_accounts (
  github_user_id INTEGER PRIMARY KEY,
  current_login TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX github_accounts_current_login
  ON github_accounts(current_login);

CREATE TABLE github_login_aliases (
  normalized_login TEXT PRIMARY KEY COLLATE NOCASE,
  github_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (github_user_id)
    REFERENCES github_accounts(github_user_id)
    ON DELETE CASCADE
);

CREATE INDEX github_login_aliases_user
  ON github_login_aliases(github_user_id);

CREATE TABLE github_credentials (
  github_user_id INTEGER PRIMARY KEY,
  encrypted_refresh_token TEXT NOT NULL,
  nonce TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  token_expires_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (github_user_id)
    REFERENCES github_accounts(github_user_id)
    ON DELETE CASCADE
);

CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  github_user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (github_user_id)
    REFERENCES github_accounts(github_user_id)
    ON DELETE CASCADE
);

CREATE INDEX sessions_user ON sessions(github_user_id);

CREATE TABLE heatmap_settings (
  github_user_id INTEGER PRIMARY KEY,
  timezone TEXT NOT NULL,
  public_enabled INTEGER NOT NULL DEFAULT 0 CHECK (public_enabled IN (0, 1)),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (github_user_id)
    REFERENCES github_accounts(github_user_id)
    ON DELETE CASCADE
);

CREATE TABLE daily_activity (
  github_user_id INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  accepted_submission_count INTEGER NOT NULL CHECK (accepted_submission_count >= 0),
  distinct_problem_count INTEGER NOT NULL CHECK (distinct_problem_count >= 0),
  source_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (github_user_id, local_date),
  FOREIGN KEY (github_user_id)
    REFERENCES github_accounts(github_user_id)
    ON DELETE CASCADE
);

CREATE INDEX daily_activity_user_date
  ON daily_activity(github_user_id, local_date);
