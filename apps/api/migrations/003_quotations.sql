-- 003: quotations and their line items.

-- Per-business, per-year counter for quotation numbers (Q-2026-0001).
CREATE TABLE quote_sequences (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year       int  NOT NULL,
  last_value int  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);

CREATE TABLE quotations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- RESTRICT: a customer with quotations can't be deleted (mark them inactive instead).
  customer_id    uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  number         text NOT NULL,
  title          text,
  issue_date     date NOT NULL,
  valid_until    date NOT NULL,
  -- 'expired' is not stored: it is a sent quotation whose valid_until has passed.
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted')),
  discount_bp    int  NOT NULL DEFAULT 0 CHECK (discount_bp BETWEEN 0 AND 10000),  -- 500 = 5%
  -- GST settings are copied onto each quotation so later rate changes don't alter old quotes.
  gst_registered boolean NOT NULL,
  gst_rate_bp    int  NOT NULL,                                                   -- 900 = 9%
  subtotal_cents bigint NOT NULL,
  discount_cents bigint NOT NULL,
  gst_cents      bigint NOT NULL,
  total_cents    bigint NOT NULL,
  notes          text,
  share_token    text NOT NULL UNIQUE,     -- unguessable id for the public PDF link
  sent_at        timestamptz,
  accepted_at    timestamptz,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  CHECK (valid_until >= issue_date)
);
CREATE INDEX quotations_tenant_issue_idx    ON quotations (tenant_id, issue_date DESC, number DESC);
CREATE INDEX quotations_tenant_status_idx   ON quotations (tenant_id, status, valid_until);
CREATE INDEX quotations_tenant_customer_idx ON quotations (tenant_id, customer_id);

CREATE TABLE quotation_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quotation_id     uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  position         int  NOT NULL,
  service          text NOT NULL,
  description      text,
  quantity         numeric(12, 2) NOT NULL CHECK (quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  amount_cents     bigint NOT NULL
);
CREATE INDEX quotation_items_quote_idx ON quotation_items (tenant_id, quotation_id, position);
