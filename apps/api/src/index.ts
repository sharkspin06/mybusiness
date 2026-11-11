import { createApp } from './app.js';
import { config } from './config.js';

createApp().listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  if (!config.databaseUrl) console.warn('DATABASE_URL is not set: database features are off.');
});
