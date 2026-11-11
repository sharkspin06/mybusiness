-- 006: tasks.

CREATE TABLE tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (length(trim(title)) > 0),
  description  text,
  status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority     text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date     date,                                   -- Singapore date; overdue = before today and not done
  assigned_to  uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_id  uuid REFERENCES customers(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_tenant_status_due_idx ON tasks (tenant_id, status, due_date);
CREATE INDEX tasks_tenant_assignee_idx   ON tasks (tenant_id, assigned_to, status);
CREATE INDEX tasks_tenant_customer_idx   ON tasks (tenant_id, customer_id);
