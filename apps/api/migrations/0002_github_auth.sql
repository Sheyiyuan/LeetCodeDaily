CREATE TABLE auth_attempts (
  state_hash TEXT PRIMARY KEY,
  redirect_uri TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX auth_attempts_expiry ON auth_attempts(expires_at);

CREATE TABLE auth_grants (
  grant_hash TEXT PRIMARY KEY,
  github_user_id INTEGER NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  nonce TEXT NOT NULL,
  access_token_expires_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (github_user_id)
    REFERENCES github_accounts(github_user_id)
    ON DELETE CASCADE
);

CREATE INDEX auth_grants_expiry ON auth_grants(expires_at);
