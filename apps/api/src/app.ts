import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { sameOriginWrites } from './lib/auth.js';
import { authRoutes } from './modules/auth/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { customerRoutes } from './modules/customers/routes.js';
import { businessRoutes } from './modules/business/routes.js';
import { quotationRoutes } from './modules/quotations/routes.js';
import { publicQuotationRoutes } from './modules/quotations/public.js';
import { appointmentRoutes } from './modules/appointments/routes.js';
import { taskRoutes } from './modules/tasks/routes.js';
import { teamRoutes } from './modules/team/routes.js';
import { exportRoutes } from './modules/export/routes.js';

// Each feature is a module under src/modules/<name> with its own router, mounted here.
// Every module router except auth, health and public applies requireAuth itself.
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', sameOriginWrites);

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/business', businessRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/quotations', quotationRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/public/quotations', publicQuotationRoutes);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    if (res.headersSent) return;
    // Malformed JSON bodies are the caller's mistake, not a server error.
    if ((err as { type?: string }).type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    res.status(500).json({ error: 'internal_error' });
  };
  app.use(onError);
  return app;
}
