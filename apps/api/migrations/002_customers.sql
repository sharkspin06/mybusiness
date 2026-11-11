-- 002: customers.

CREATE TABLE customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text NOT NULL CHECK (length(trim(name)) > 0),
  company           text,
  customer_type     text NOT NULL DEFAULT 'individual' CHECK (customer_type IN ('individual', 'business')),
  phone             text,                    -- stored as +6591234567; shown as +65 9123 4567
  email             text,
  address           text,                    -- Blk / street / #unit
  postal_code       text CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{6}$'),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('lead', 'active', 'inactive')),
  preferred_contact text NOT NULL DEFAULT 'whatsapp' CHECK (preferred_contact IN ('whatsapp', 'phone', 'email')),
  tags              text[] NOT NULL DEFAULT '{}',
  notes             text,
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customers_tenant_name_idx    ON customers (tenant_id, lower(name));
CREATE INDEX customers_tenant_status_idx  ON customers (tenant_id, status);
CREATE INDEX customers_tenant_updated_idx ON customers (tenant_id, updated_at DESC);
CREATE INDEX customers_tenant_phone_idx   ON customers (tenant_id, phone);
