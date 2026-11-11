import { Router } from 'express';
import { pool } from '../../db/pool.js';

export const healthRoutes = Router();

healthRoutes.get('/', async (_req, res) => {
  let db: 'ok' | 'not_configured' | 'error' = 'not_configured';
  if (pool) {
    try {
      await pool.query('SELECT 1');
      db = 'ok';
    } catch {
      db = 'error';
    }
  }
  res.json({ status: 'ok', db, time: new Date().toISOString() });
});
