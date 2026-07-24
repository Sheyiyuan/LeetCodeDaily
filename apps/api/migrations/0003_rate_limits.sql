CREATE TABLE api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  expires_at TEXT NOT NULL
);

CREATE INDEX api_rate_limits_expiry ON api_rate_limits(expires_at);
