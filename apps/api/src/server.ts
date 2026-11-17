import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const DEFAULT_PORT = 3001;
const MISSING_KEY_MESSAGE =
  'ANTHROPIC_API_KEY is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.';

const resolvePort = (): number => {
  const port = Number(process.env.PORT);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
};

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(MISSING_KEY_MESSAGE);
  process.exit(1);
}

const port = resolvePort();
serve({ fetch: createApp(new Anthropic()).fetch, port }, () => {
  console.log(`Rytm API listening on http://localhost:${port}`);
});
