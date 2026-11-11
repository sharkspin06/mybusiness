-- 004: sign-in sessions.
-- The cookie holds a random token; only its SHA-256 hash is stored here, so a database leak can't be used to sign in.

CREATE TABLE sessions (
  id           text PRIMARY KEY,                                   -- sha256(token), hex
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- business the user is working in
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  user_agent   text,
  ip           text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

ALTER TABLE users ADD COLUMN last_login_at timestamptz;
