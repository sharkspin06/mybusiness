-- 005: calendar appointments.
-- Times are timestamptz (stored UTC) and always shown in Singapore time (UTC+8, no daylight saving).

CREATE TABLE appointments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- No customer = an internal event (team meeting, supplier visit). If the customer is deleted the appointment stays.
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  title       text NOT NULL CHECK (length(trim(title)) > 0),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  location    text,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  notes       text,
  -- Reminder settings, e.g. [{"channel":"whatsapp","minutesBefore":1440}]. Sending them comes in a later step.
  reminders   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX appointments_tenant_start_idx    ON appointments (tenant_id, starts_at);
CREATE INDEX appointments_tenant_customer_idx ON appointments (tenant_id, customer_id, starts_at);
