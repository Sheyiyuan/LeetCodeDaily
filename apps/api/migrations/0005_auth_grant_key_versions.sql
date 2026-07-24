ALTER TABLE auth_grants
ADD COLUMN key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0);
