import { createApp, createContext } from './app.ts';
import { loadConfig } from './config.ts';
import { one } from './db/connection.ts';
import { seedAll } from './db/seed.ts';

const config = loadConfig();
const ctx = createContext(config);

if (!one(ctx.db, 'SELECT 1 FROM branches LIMIT 1')) {
  console.log('Empty database, seeding sample data...');
  await seedAll(ctx.db, ctx.clock.now());
}

createApp(ctx).listen(config.port, () => {
  console.log(`Stacks circulation listening on http://localhost:${config.port}`);
  console.log(`Clock: ${ctx.clock.now().toISOString()}`);
});
