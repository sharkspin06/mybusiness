import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Passwords are hashed with scrypt (built into Node: no native add-ons, runs anywhere).
// Stored as: scrypt$N$r$p$<salt base64>$<hash base64>, so the cost can be raised later.
const N = 2 ** 16;
const r = 8;
const p = 1;
const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

const options = (n: number, rr: number, pp: number): ScryptOptions => ({ N: n, r: rr, p: pp, maxmem: 256 * n * rr });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, options(N, r, p));
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, rr, pp, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, options(Number(n), Number(rr), Number(pp)));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Used when the email doesn't exist, so a wrong email takes as long as a wrong password.
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword('not-a-real-password');
  await verifyPassword(password, await dummy);
}
