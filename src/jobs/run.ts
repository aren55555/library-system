import { createContext } from '../app.ts';
import { loadConfig } from '../config.ts';
import { runNightly } from './nightly.ts';

const ctx = createContext(loadConfig());
console.log(JSON.stringify(await runNightly(ctx), null, 2));
