import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// One .env at the repo root, shared by all apps. Walk up from this file to find it
// (works from src/ in development and from dist/ after a build).
function findEnv(start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return undefined;
}
const envPath = findEnv(path.dirname(fileURLToPath(import.meta.url)));
if (envPath) loadEnv({ path: envPath, quiet: true });

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  // Address customers use to open shared quotation PDFs (the site address in production).
  publicUrl: (process.env.PUBLIC_URL ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, ''),
  production: process.env.NODE_ENV === 'production',
  // Session cookies are HTTPS-only in production (override with SECURE_COOKIES=0 only for a plain-HTTP test server).
  secureCookies: process.env.SECURE_COOKIES ? process.env.SECURE_COOKIES === '1' : process.env.NODE_ENV === 'production',
  // Set TRUST_PROXY=1 behind nginx/Caddy so the real client IP is used for sign-in rate limits.
  trustProxy: process.env.TRUST_PROXY === '1',
};
