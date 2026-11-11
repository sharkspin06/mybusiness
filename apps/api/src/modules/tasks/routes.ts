import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import {
  TASK_DUE_FILTERS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskInputSchema,
  type Task,
  type TaskData,
  type TaskListResponse,
  type TaskSummary,
} from '@mybusiness/shared';
import { withTenant } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { auth, requireAuth } from '../../lib/auth.js';
import { isUuid, sendValidationError } from '../../lib/http.js';

export const taskRoutes = Router();
taskRoutes.use(requireAuth);

const TODAY = `(now() AT TIME ZONE 'Asia/Singapore')::date`;
const OVERDUE = `(t.status <> 'done' AND t.due_date < ${TODAY})`;
const SELECT = `SELECT t.*, ${OVERDUE} AS overdue, u.name AS u_name, c.name AS c_name
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assigned_to
  LEFT JOIN customers c ON c.id = t.customer_id AND c.tenant_id = t.tenant_id`;
// Open tasks first; then overdue/soonest deadline, high priority first; tasks with no date last.
const ORDER = `ORDER BY (t.status = 'done'), t.due_date NULLS LAST,
  CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.created_at DESC`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toTask = (r: any): Task => ({
  id: r.id,
  title: r.title,
  description: r.description,
  status: r.status,
  priority: r.priority,
  dueDate: r.due_date,
  assignedTo: r.assigned_to,
  customerId: r.customer_id,
  overdue: r.overdue,
  assignee: r.assigned_to ? { id: r.assigned_to, name: r.u_name } : null,
  customer: r.customer_id ? { id: r.customer_id, name: r.c_name } : null,
  completedAt: r.completed_at?.toISOString() ?? null,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

async function load(db: pg.PoolClient, tenantId: string, id: string) {
  const r = await db.query(`${SELECT} WHERE t.tenant_id = $1 AND t.id = $2`, [tenantId, id]);
  return r.rows[0] ? toTask(r.rows[0]) : null;
}

async function checkRefs(db: pg.PoolClient, tenantId: string, d: Pick<TaskData, 'assignedTo' | 'customerId'>) {
  const fields: Record<string, string> = {};
  if (d.assignedTo && !(await db.query('SELECT 1 FROM memberships WHERE tenant_id = $1 AND user_id = $2', [tenantId, d.assignedTo])).rowCount) {
    fields.assignedTo = 'Choose someone in this business';
  }
  if (d.customerId && !(await db.query('SELECT 1 FROM customers WHERE tenant_id = $1 AND id = $2', [tenantId, d.customerId])).rowCount) {
    fields.customerId = 'Choose a customer';
  }
  return Object.keys(fields).length ? fields : null;
}

const listQuery = z.object({
  status: z.enum(['open', 'done', 'all', ...TASK_STATUSES]).default('open'),
  assignee: z.union([z.literal('me'), z.literal('none'), z.string().uuid()]).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  due: z.enum(TASK_DUE_FILTERS).optional(),
  customerId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
});

// GET /api/tasks?status=open|done|all|todo|in_progress&assignee=me|none|<id>&priority=high&due=overdue|today|week|none&q=
taskRoutes.get('/', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const f = parsed.data;
  const { tenantId, userId } = auth(req);
  const body = await withTenant(tenantId, async (db) => {
    const where = ['t.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (f.assignee === 'me') add('t.assigned_to = ?', userId);
    else if (f.assignee === 'none') where.push('t.assigned_to IS NULL');
    else if (f.assignee) add('t.assigned_to = ?', f.assignee);
    if (f.priority) add('t.priority = ?', f.priority);
    if (f.customerId) add('t.customer_id = ?', f.customerId);
    if (f.q) add(`t.title ILIKE ?`, `%${f.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    if (f.due === 'overdue') where.push(OVERDUE);
    if (f.due === 'today') where.push(`t.due_date = ${TODAY}`);
    if (f.due === 'week') where.push(`t.due_date BETWEEN ${TODAY} AND ${TODAY} + 6`);
    if (f.due === 'none') where.push('t.due_date IS NULL');
    const base = where.join(' AND ');
    // Counts ignore the status filter so the tabs can show them.
    const counts = await db.query<{ open: number; overdue: number; done: number }>(
      `SELECT count(*) FILTER (WHERE t.status <> 'done')::int AS open, count(*) FILTER (WHERE ${OVERDUE})::int AS overdue,
              count(*) FILTER (WHERE t.status = 'done')::int AS done
       FROM tasks t WHERE ${base}`,
      params,
    );
    const statusSql =
      f.status === 'open' ? ` AND t.status <> 'done'` : f.status === 'done' ? ` AND t.status = 'done'` : f.status === 'all' ? '' : ` AND t.status = '${f.status}'`;
    // Done tasks: only the 100 most recently completed, so old ones don't pile up.
    const rows = await db.query(`${SELECT} WHERE ${base}${statusSql} ${ORDER} LIMIT 500`, params);
    const items = rows.rows.map(toTask);
    const done = items.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 100);
    const out: TaskListResponse = { items: [...items.filter((t) => t.status !== 'done'), ...done], counts: counts.rows[0]! };
    return out;
  });
  res.json(body);
});

// GET /api/tasks/summary — for the menu badge and dashboard.
taskRoutes.get('/summary', async (req, res) => {
  const { tenantId, userId } = auth(req);
  const s = await withTenant(tenantId, async (db) => {
    const r = await db.query<TaskSummary>(
      `SELECT count(*) FILTER (WHERE t.status <> 'done')::int AS open,
              count(*) FILTER (WHERE ${OVERDUE})::int AS overdue,
              count(*) FILTER (WHERE t.status <> 'done' AND t.due_date = ${TODAY})::int AS "dueToday",
              count(*) FILTER (WHERE t.status <> 'done' AND t.assigned_to = $2)::int AS mine
       FROM tasks t WHERE t.tenant_id = $1`,
      [tenantId, userId],
    );
    return r.rows[0]!;
  });
  res.json(s);
});

const audit = (t: Task) => ({ title: t.title, customerId: t.customerId });

// POST /api/tasks
taskRoutes.post('/', async (req, res) => {
  const parsed = taskInputSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const d = parsed.data;
  const { tenantId, userId } = auth(req);
  const result = await withTenant(tenantId, async (db) => {
    const bad = await checkRefs(db, tenantId, d);
    if (bad) return { fields: bad };
    const r = await db.query<{ id: string }>(
      `INSERT INTO tasks (tenant_id, title, description, status, priority, due_date, assigned_to, customer_id, completed_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $4 = 'done' THEN now() END, $9) RETURNING id`,
      [tenantId, d.title, d.description, d.status, d.priority, d.dueDate, d.assignedTo, d.customerId, userId],
    );
    const t = (await load(db, tenantId, r.rows[0]!.id))!;
    await writeAudit(db, { tenantId, userId, action: 'task.created', entityType: 'task', entityId: t.id, data: audit(t) });
    return { t };
  });
  if ('fields' in result) return res.status(400).json({ error: 'validation', fields: result.fields });
  res.status(201).json(result.t);
});

// PUT /api/tasks/:id
taskRoutes.put('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const parsed = taskInputSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const d = parsed.data;
  const { tenantId, userId } = auth(req);
  const result = await withTenant(tenantId, async (db) => {
    const before = await load(db, tenantId, req.params.id);
    if (!before) return { missing: true as const };
    const bad = await checkRefs(db, tenantId, d);
    if (bad) return { fields: bad };
    await db.query(
      `UPDATE tasks SET title = $3, description = $4, status = $5, priority = $6, due_date = $7, assigned_to = $8, customer_id = $9,
         completed_at = CASE WHEN $5 = 'done' THEN coalesce(completed_at, now()) END, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, req.params.id, d.title, d.description, d.status, d.priority, d.dueDate, d.assignedTo, d.customerId],
    );
    const t = (await load(db, tenantId, req.params.id))!;
    const action = before.status !== 'done' && t.status === 'done' ? 'task.completed' : before.status === 'done' && t.status !== 'done' ? 'task.reopened' : 'task.updated';
    await writeAudit(db, { tenantId, userId, action, entityType: 'task', entityId: t.id, data: audit(t) });
    return { t };
  });
  if ('missing' in result) return res.status(404).json({ error: 'not_found' });
  if ('fields' in result) return res.status(400).json({ error: 'validation', fields: result.fields });
  res.json(result.t);
});

// PATCH /api/tasks/:id/status { status } — tick box and board drag.
taskRoutes.patch('/:id/status', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const parsed = z.object({ status: z.enum(TASK_STATUSES) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { status } = parsed.data;
  const { tenantId, userId } = auth(req);
  const t = await withTenant(tenantId, async (db) => {
    const before = await load(db, tenantId, req.params.id);
    if (!before) return null;
    if (before.status === status) return before;
    await db.query(
      `UPDATE tasks SET status = $3, completed_at = CASE WHEN $3 = 'done' THEN now() END, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
      [tenantId, req.params.id, status],
    );
    const after = (await load(db, tenantId, req.params.id))!;
    const action = status === 'done' ? 'task.completed' : before.status === 'done' ? 'task.reopened' : 'task.updated';
    await writeAudit(db, { tenantId, userId, action, entityType: 'task', entityId: after.id, data: audit(after) });
    return after;
  });
  if (!t) return res.status(404).json({ error: 'not_found' });
  res.json(t);
});

// DELETE /api/tasks/:id
taskRoutes.delete('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { tenantId, userId } = auth(req);
  const ok = await withTenant(tenantId, async (db) => {
    const before = await load(db, tenantId, req.params.id);
    if (!before) return false;
    await db.query('DELETE FROM tasks WHERE tenant_id = $1 AND id = $2', [tenantId, req.params.id]);
    await writeAudit(db, { tenantId, userId, action: 'task.deleted', entityType: 'task', entityId: before.id, data: audit(before) });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});
