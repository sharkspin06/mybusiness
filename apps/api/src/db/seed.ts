// Development data: one business, its owner and a few sample customers. Safe to run more than once.
// Never run this against a production database.
import { config } from '../config.js';
import { DEV_TENANT_ID, DEV_USER_ID } from '../lib/devIds.js';
import { addDays, sgToIso, startOfWeek, todayInSingapore } from '@mybusiness/shared';
import { hashPassword } from '../lib/password.js';
import { requirePool } from './pool.js';

const sampleCustomers: [string, string | null, 'individual' | 'business', string, string, string, string, 'lead' | 'active' | 'inactive', string[]][] = [
  ['Tan Wei Ming', null, 'individual', '+6591234567', 'weiming@example.sg', 'Blk 123 Ang Mo Kio Ave 3, #05-67', '560123', 'active', ['Renovation', 'HDB']],
  ['Priya Raman', 'Bloom Florist Pte Ltd', 'business', '+6582345678', 'priya@example.sg', '45 Joo Chiat Road', '427371', 'active', ['Retail']],
  ['Rajesh Kumar', 'RK Consulting', 'business', '+6586789012', 'rajesh@example.sg', '1 Raffles Place, #20-01', '048616', 'lead', []],
  ['Lim Hui Shan', 'HS Beauty Studio', 'business', '+6593456789', 'huishan@example.sg', '9 Tampines Central 1, #02-15', '529541', 'lead', ['Salon']],
  ['Ahmad Bin Yusof', 'AY Logistics', 'business', '+6584567890', 'ahmad@example.sg', '22 Tuas Avenue 8', '639238', 'active', ['Industrial']],
  ['Sarah Goh', null, 'individual', '+6597890123', 'sarah.goh@example.sg', 'Blk 456 Bishan Street 13, #11-02', '570456', 'active', ['Condo']],
  ['Chloe Ng', 'Kopi Corner Cafe', 'business', '+6595678901', 'chloe@example.sg', '78 Tiong Bahru Road', '160078', 'inactive', ['F&B']],
];

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production.');
  if (!config.databaseUrl) throw new Error('DATABASE_URL is not set.');
  const pool = requirePool();
  await pool.query(
    `INSERT INTO tenants (id, name, plan) VALUES ($1, 'My Business', 'trial') ON CONFLICT (id) DO NOTHING`,
    [DEV_TENANT_ID],
  );
  // Sample business details for quotation PDFs (only filled in if not set yet).
  await pool.query(
    `UPDATE tenants SET gst_registered = true, uen = '202400001A', gst_reg_no = '202400001A',
       phone = '+6561234567', email = 'hello@mybusiness.example', address = '10 Ubi Crescent, #03-21, Singapore 408564'
     WHERE id = $1 AND uen IS NULL`,
    [DEV_TENANT_ID],
  );
  await pool.query(
    `INSERT INTO users (id, email, name) VALUES ($1, 'owner@example.sg', 'Owner') ON CONFLICT (id) DO NOTHING`,
    [DEV_USER_ID],
  );
  await pool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
    [DEV_TENANT_ID, DEV_USER_ID],
  );
  // Development sign-in for the sample owner (owner@example.sg). Only set when it has no password yet.
  // Override with SEED_OWNER_PASSWORD in .env. Never use these values on a real server.
  const devPassword = process.env.SEED_OWNER_PASSWORD || 'mybusiness-dev-2026';
  const pw = await pool.query(
    'UPDATE users SET password_hash = $2 WHERE id = $1 AND password_hash IS NULL RETURNING id',
    [DEV_USER_ID, await hashPassword(devPassword)],
  );
  if (pw.rowCount) console.log('set the sample owner password (see SEED_OWNER_PASSWORD in .env.example)');
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM customers WHERE tenant_id = $1', [DEV_TENANT_ID]);
  if (rows[0]!.n === 0) {
    for (const [name, company, type, phone, email, address, postal, status, tags] of sampleCustomers) {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO customers (tenant_id, name, company, customer_type, phone, email, address, postal_code, status, tags, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [DEV_TENANT_ID, name, company, type, phone, email, address, postal, status, tags, DEV_USER_ID],
      );
      await pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, data) VALUES ($1, $2, 'customer.created', 'customer', $3, '{}')`,
        [DEV_TENANT_ID, DEV_USER_ID, r.rows[0]!.id],
      );
    }
    console.log(`added ${sampleCustomers.length} sample customers`);
  } else {
    console.log('sample customers already present');
  }

  // Sample appointments in the current week (Monday = day 0), so the calendar has something to show.
  const appts = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM appointments WHERE tenant_id = $1', [DEV_TENANT_ID]);
  if (appts.rows[0]!.n === 0) {
    const monday = startOfWeek(todayInSingapore());
    const idOf = async (name: string) =>
      (await pool.query<{ id: string }>('SELECT id FROM customers WHERE tenant_id = $1 AND name = $2', [DEV_TENANT_ID, name])).rows[0]?.id ?? null;
    const sample: [number, string, string, string, string | null, string][] = [
      [0, '09:00', '10:00', 'Team briefing', null, 'Office'],
      [1, '14:00', '15:30', 'Quote review', 'Rajesh Kumar', 'Video call'],
      [2, '10:00', '11:00', 'Call', 'Priya Raman', 'Phone'],
      [2, '15:00', '16:30', 'Site visit', 'Ahmad Bin Yusof', '22 Tuas Avenue 8'],
      [3, '11:00', '12:00', 'Supplier meeting', null, 'Ubi office'],
      [4, '10:00', '11:30', 'Site measurement', 'Tan Wei Ming', 'Blk 123 Ang Mo Kio Ave 3'],
      [4, '16:00', '17:00', 'Follow-up', 'Lim Hui Shan', 'Phone'],
      [5, '09:30', '10:30', 'Consultation', 'Sarah Goh', 'Bishan'],
      [9, '14:30', '15:30', 'Material selection', 'Tan Wei Ming', 'Showroom'],
    ];
    for (const [day, from, to, title, customer, location] of sample) {
      const date = addDays(monday, day);
      await pool.query(
        `INSERT INTO appointments (tenant_id, customer_id, title, starts_at, ends_at, location, assigned_to, status, reminders, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, $7)`,
        [DEV_TENANT_ID, customer ? await idOf(customer) : null, title, sgToIso(date, from), sgToIso(date, to), location, DEV_USER_ID,
          JSON.stringify(customer ? [{ channel: 'whatsapp', minutesBefore: 1440 }] : [])],
      );
    }
    console.log(`added ${sample.length} sample appointments`);
  }
  // Sample tasks with deadlines around today (one overdue).
  const tasks = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM tasks WHERE tenant_id = $1', [DEV_TENANT_ID]);
  if (tasks.rows[0]!.n === 0) {
    const today = todayInSingapore();
    const idOf = async (name: string) =>
      (await pool.query<{ id: string }>('SELECT id FROM customers WHERE tenant_id = $1 AND name = $2', [DEV_TENANT_ID, name])).rows[0]?.id ?? null;
    const sample: [string, 'high' | 'medium' | 'low', number | null, 'todo' | 'in_progress' | 'done', string | null][] = [
      ['Follow up overdue invoice', 'high', -2, 'todo', 'Ahmad Bin Yusof'],
      ['Send revised quote to Tan Wei Ming', 'high', 1, 'todo', 'Tan Wei Ming'],
      ['Confirm aircon servicing slot', 'medium', 0, 'in_progress', 'Rajesh Kumar'],
      ['Order quartz samples', 'medium', 2, 'in_progress', 'Tan Wei Ming'],
      ['Prepare December promo flyer', 'low', 19, 'todo', null],
      ['Upload site photos for AY Logistics', 'low', -1, 'done', 'Ahmad Bin Yusof'],
    ];
    for (const [title, priority, days, status, customer] of sample) {
      await pool.query(
        `INSERT INTO tasks (tenant_id, title, priority, due_date, status, assigned_to, customer_id, completed_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $5 = 'done' THEN now() END, $6)`,
        [DEV_TENANT_ID, title, priority, days === null ? null : addDays(today, days), status, DEV_USER_ID, customer ? await idOf(customer) : null],
      );
    }
    console.log(`added ${sample.length} sample tasks`);
  }
  console.log('dev business ready');
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
