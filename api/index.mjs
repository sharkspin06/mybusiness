// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json).
// The Express app is pre-bundled by `npm run build` (apps/api tsup -> dist/app.js),
// so Vercel doesn't need to compile the TypeScript workspace packages itself.
import { createApp } from '../apps/api/dist/app.js';

export default createApp();
