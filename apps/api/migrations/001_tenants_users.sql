-- 001: businesses (tenants), users and who belongs to which business.
--
-- Multi-tenant rules for every later migration:
--   * Every business table has  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
--   * Every index on such a table starts with tenant_id
--   * Money is stored as BIGINT cents, never float
--   * Timestamps are timestamptz (stored UTC, shown in Asia/Singapore)

CREATE TABLE tenants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  uen            text,                       -- Singapore Unique Entity Number
  gst_registered boolean NOT NULL DEFAULT false,
  gst_reg_no     text,
  phone          text,
  email          text,
  address        text,
  timezone       text NOT NULL DEFAULT 'Asia/Singapore',
  currency       char(3) NOT NULL DEFAULT 'SGD',
  plan           text NOT NULL DEFAULT 'trial',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text,                        -- null until the user sets a password
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- A user can belong to several businesses, with one role in each.
CREATE TABLE memberships (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);

-- Change history per business; feeds the History tab and exports.
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,                 -- e.g. 'customer.created'
  entity_type text NOT NULL,
  entity_id   uuid,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (tenant_id, entity_type, entity_id, created_at DESC);
