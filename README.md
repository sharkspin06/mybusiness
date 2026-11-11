# My Business Platform

Business management for Singapore businesses: customers, quotations, calendar, tasks and documents.
One install serves many businesses (multi-tenant), and it runs on a plain VPS with Node and PostgreSQL. No outside services are needed.

Approved design: [`design/DESIGN-APPROVED.md`](design/DESIGN-APPROVED.md) (the canvas link is inside). Don't change the design without approval.

## Status

| Area | State |
|---|---|
| App shell (sidebar, top bar, phone bottom tabs, More page) | Done |
| Dashboard | Done (layout) |
| Customers | Done: list (status tabs, search, paging), add/edit/delete, profile with Info and History tabs |
| Quotations | Done: list (status tabs, search), builder (line items, discount, GST 9%), PDF, WhatsApp share with a public PDF link, Draft → Sent → Accepted (accepted is locked) |
| Calendar | Done: day, week and month views (desktop and phone), drag to reschedule (desktop), click a slot to book, appointment form with customer, assignee, status and reminder settings, customer Appointments tab and Next appointment. Reminders are saved but not sent yet (needs a WhatsApp/email provider) |
| Tasks | Done: list and board (To do / In progress / Done), filters (status, assignee, priority, due date), tick to complete, drag between board columns (desktop), phone list with quick filters, overdue count in the menu |
| Settings & team | Done: business profile (UEN, GST), quotation defaults (validity, terms), users & roles, invite links, password links for team members, your account (name, password), CSV and full JSON export. Reminders and subscription pages say they're not set up yet |
| Documents | Placeholder page |
| API | `/api/health`, `/api/auth` (+ invite, reset, password), `/api/business` (+ members), `/api/team`, `/api/customers` (+ history, summary), `/api/quotations` (+ status, pdf), `/api/appointments` (+ time), `/api/tasks` (+ status, summary), `/api/export`, public `/api/public/quotations/<token>.pdf` |
| Database | `001` tenants, users, memberships, audit log · `002` customers · `003` quotations, items, number sequence · `004` sessions · `005` appointments · `006` tasks · `007` quotation defaults, invite/reset tokens |
| Login / sessions | Done: sign up (new business + owner), sign in, sign out, switch business. Sessions in Postgres behind an HttpOnly cookie, scrypt passwords, sign-in rate limit, same-origin check on writes. Not yet: password reset by email, inviting team members |

## Tech stack

- **Web:** React 19, TypeScript, Tailwind CSS 4, Vite 7, React Router 7
- **API:** Node, Express 5, TypeScript, `pg`, helmet, cors
- **Database:** PostgreSQL 13 or newer (uses `gen_random_uuid()`)
- **Shared:** `@mybusiness/shared`, an npm workspace package used by both web and api

## Structure

```
apps/web            React app (Vite)                         http://localhost:5173
  src/layout/       AppShell, Sidebar, nav.ts (menu + phone tabs)
  src/pages/        one file per page
  src/components/   ui.tsx (shared UI pieces), Icon.tsx
  src/index.css     design tokens: colours, type, spacing
apps/api            Express API                              http://localhost:4000
  src/modules/      one folder per feature (health, customers, …)
  src/db/           pool.ts (withTenant), migrate.ts
  migrations/       plain SQL, applied in order
packages/shared     formats (S$, DD/MM/YYYY, +65), GST maths, roles
design/             approved Phase 1 design (canvas copy + handover notes)
```

## Requirements

- Node.js 20.19 or newer (22 LTS recommended) and npm
- PostgreSQL 13 or newer

## First-time setup

1. Install packages from the repo root: `npm install`
2. Create the database (in psql or pgAdmin, as the `postgres` user):
   ```sql
   CREATE ROLE mybusiness LOGIN PASSWORD 'choose-a-password';
   CREATE DATABASE mybusiness OWNER mybusiness;
   ```
3. Copy `.env.example` to `.env` and put that password in `DATABASE_URL`.
   Check the port: PostgreSQL 14 and 18 are both installed on this PC, and only one can use 5432.
4. Create the tables: `npm run db:migrate`

## Run (development)

Start these in two terminals:

```
npm run dev:api     # API on http://localhost:4000, restarts on save
npm run dev:web     # web app on http://localhost:5173
```

Open http://localhost:5173. In development, Vite forwards `/api/*` to the API, so the web app calls `/api/...` with no host.

Check the database connection at http://localhost:4000/api/health:

```json
{ "status": "ok", "db": "ok", "time": "..." }
```

`db` is `not_configured` when `DATABASE_URL` is empty, and `error` when the database can't be reached.

## Scripts

Run these from the repo root.

| Command | What it does |
|---|---|
| `npm run dev:web` | Vite dev server for the web app |
| `npm run dev:api` | API with auto-restart (`tsx watch`) |
| `npm run db:migrate` | Apply new SQL migrations |
| `npm run db:seed` | Development only: create the sample business, its owner (owner@example.sg, password from `SEED_OWNER_PASSWORD` in `.env.example`) and 7 sample customers (safe to re-run) |
| `npm run typecheck` | Type-check every workspace |
| `npm run build` | Check shared, build web to `apps/web/dist` and api to `apps/api/dist` |
| `npm run start -w @mybusiness/api` | Run the built API (`node dist/index.js`) |

## Environment variables

There is one `.env` at the repo root, and the API finds it from `src/` or `dist/`. Never commit `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none | `postgres://user:password@host:port/database` |
| `API_PORT` | `4000` | Port the API listens on |
| `WEB_ORIGIN` | `http://localhost:5173` | Origin allowed by CORS (set it to the real site address in production) |
| `PUBLIC_URL` | same as `WEB_ORIGIN` | Address used in the quotation PDF links sent on WhatsApp (must be reachable by customers) |

## Sign-in and security

- Signing up at `/signup` creates a business (tenant) and makes you its owner. Sign in at `/login`.
- The session cookie `mb_session` is HttpOnly, SameSite=Lax, and HTTPS-only when `NODE_ENV=production`. Only a SHA-256 hash of the token is stored (`sessions` table). Sessions last 30 days from last use.
- Passwords: scrypt (built into Node), at least 10 characters. A wrong email and a wrong password give the same message. After 8 failed tries for one email within 15 minutes, sign-in pauses.
- Every API module except `auth`, `health` and the public quotation PDF uses `requireAuth`, which sets `req.auth` (user, business, role) from the session.
- Writes (POST/PUT/DELETE) from another site are refused: `Origin` must equal `WEB_ORIGIN`.
- In production behind nginx or Caddy, set `TRUST_PROXY=1` so rate limits see the real visitor IP.

## Database migrations

- Files live in `apps/api/migrations/` and are named `NNN_name.sql` (`002_customers.sql`, …).
- `npm run db:migrate` applies each new file once, in name order, inside its own transaction. Applied files are recorded in `schema_migrations`.
- Never edit a migration that has already been applied. Add a new one instead.
- Every business table follows the rules at the top of `001_tenants_users.sql`:
  - `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
  - every index starts with `tenant_id`
  - money is `BIGINT` cents
  - timestamps are `timestamptz`, stored in UTC and shown in Asia/Singapore time

## Adding a feature

1. **API:** create `apps/api/src/modules/<name>/routes.ts` that exports an Express `Router`, then mount it in `apps/api/src/app.ts` under `/api/<name>`. Run every query through `withTenant(tenantId, client => …)`.
2. **Tables:** add a migration (see above).
3. **Web:** add the page in `apps/web/src/pages/`, replace its placeholder route in `apps/web/src/router.tsx`, and update `apps/web/src/layout/nav.ts` if it needs a menu entry.
4. **Shared logic** (formats, money, roles) goes in `packages/shared` so web and api agree.

## Rules for the code

- Every business table has `tenant_id`. Module queries go through `withTenant()` (`apps/api/src/db/pool.ts`), which also sets `app.tenant_id` so Postgres row-level security can be added later.
- Money is integer cents (`BIGINT`). GST is 9% of (subtotal − discount), and only GST-registered businesses charge it. Use `calculateTotals()` from `packages/shared`.
- Dates are shown as DD/MM/YYYY, times in 24-hour format, phones as +65 XXXX XXXX, and quotation numbers as Q-YYYY-NNNN (`packages/shared`).
- Roles per business: `owner`, `admin`, `staff`.
- Colours, type and spacing come only from the tokens in `apps/web/src/index.css`.
- Must stay self-hostable: no outside services are required to run.

## Deploying (VPS)

1. Install Node and PostgreSQL, create the database as in setup step 2, and create `.env` with the production `DATABASE_URL` and `WEB_ORIGIN`.
2. Run `npm ci`, `npm run build` and `npm run db:migrate`.
3. Run the API with `npm run start -w @mybusiness/api` under a process manager (systemd or pm2).
4. Serve `apps/web/dist` from a web server (nginx or Caddy). Send `/api/*` to the API port, and send every other path to `index.html` so the app's page links work.

## Team invites and password links

There is no email sending yet, so invites and password resets are links that an owner or admin sends themselves (copy, or "Send on WhatsApp"):

- **Invite** (Settings › Users & permissions › Invite someone): for one email and role, works once, expires in 7 days. A new person sets their name and password. Someone who already has an account enters their own password to add the business.
- **Password link** (next to a team member): works once, expires in 24 hours, and signs that person out everywhere. It can't be made for someone who also belongs to another business; they change their password in Settings › Your account.
- Owners who forget their password can't be reset from the app yet. Until email is added, an owner can be given a reset link from the server by another owner, or via the database.

## Backups

Settings › Data export lets owners and admins download CSVs and a full JSON copy at any time. On the server, also back up the whole database every night:

```
# /etc/cron.d/mybusiness-backup  (runs 03:00 Singapore time; keeps 14 days)
0 3 * * * postgres pg_dump -Fc mybusiness > /var/backups/mybusiness/db-$(date +\%F).dump && find /var/backups/mybusiness -name 'db-*.dump' -mtime +14 -delete
```

Copy the backup folder off the VPS too (for example to another server or cloud storage). Restore with `pg_restore -d mybusiness <file>`.

## Deploying (Vercel)

The repo deploys to Vercel as-is: `vercel.json` builds everything, serves `apps/web/dist`, and sends `/api/*` to one serverless function (`api/index.mjs`, which loads the pre-built Express app from `apps/api/dist/app.js`).

1. Create a Postgres database (Vercel → Storage → Neon). Use the **pooled** connection string.
2. Run the migrations against it from your computer: `DATABASE_URL="<url>" npm run db:migrate`.
3. Import the repo in Vercel (root directory = repo root) and set these environment variables: `DATABASE_URL`, `NODE_ENV=production`, `WEB_ORIGIN=https://<project>.vercel.app`, `PUBLIC_URL` (same as `WEB_ORIGIN`), `TRUST_PROXY=1`.
4. `WEB_ORIGIN` must match the site address exactly, or saves are refused. Redeploy after changing it.

Note: the sign-in rate limit is kept in memory, so on Vercel it counts per serverless instance.
