import type { RequestHandler } from 'express';
import type { Role } from '@mybusiness/shared';
import { config } from '../config.js';
import { SESSION_COOKIE, clearSessionCookie, readCookie } from './cookies.js';
import { findSession, touchSession } from './sessions.js';

export interface AuthContext {
  sessionId: string;
  tenantId: string;
  userId: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/** Requires a signed-in user. Sets req.auth to their user, current business (tenant) and role there. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = readCookie(req, SESSION_COOKIE);
  const session = token ? await findSession(token) : null;
  if (!session) {
    if (token) clearSessionCookie(res);
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.auth = { sessionId: session.sessionId, tenantId: session.tenantId, userId: session.userId, role: session.role };
  touchSession(session).catch((err) => console.error('touchSession', err));
  next();
};

/** Use inside a route after requireAuth. */
export function auth(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw new Error('requireAuth missing on this route');
  return req.auth;
}

/** Only owners and admins (use after requireAuth). Staff get 403. */
export const requireManager: RequestHandler = (req, res, next) => {
  if (req.auth?.role === 'owner' || req.auth?.role === 'admin') return next();
  res.status(403).json({ error: 'forbidden' });
};

/**
 * Blocks cross-site requests that change data: a browser always sends Origin on POST/PUT/DELETE,
 * and it must be our own site. Together with SameSite cookies this stops CSRF.
 */
export const sameOriginWrites: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (origin && origin !== config.webOrigin) return res.status(403).json({ error: 'bad_origin' });
  next();
};
