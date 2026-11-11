-- 007: quotation defaults per business, and one-time links for team invites and password resets.

ALTER TABLE tenants
  ADD COLUMN quote_validity_days int NOT NULL DEFAULT 30 CHECK (quote_validity_days BETWEEN 1 AND 365),
  ADD COLUMN quote_terms text;

-- Invite and password-reset links. Only the SHA-256 hash of the link's token is stored.
CREATE TABLE auth_tokens (
  id         text PRIMARY KEY,                                   -- sha256(token), hex
  kind       text NOT NULL CHECK (kind IN ('invite', 'reset')),
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE,       -- invite: business to join
  email      text,                                               -- invite: who it's for
  role       text CHECK (role IN ('owner', 'admin', 'staff')),   -- invite: their role
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,         -- reset: whose password
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX auth_tokens_tenant_idx ON auth_tokens (tenant_id, kind) WHERE used_at IS NULL;
