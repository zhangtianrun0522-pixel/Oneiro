import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { cors } from 'hono/cors';

export const config = { runtime: 'nodejs' };
import { interpretDream } from './_lib/services/geminiService';

const app = new Hono();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.post('/api/interpret', async (c) => {
  const { dreamText, userInfo, astroInfo } = await c.req.json();
  if (!dreamText) return c.json({ error: 'dreamText required' }, 400);
  const result = await interpretDream(userInfo ?? {}, astroInfo ?? {}, dreamText);
  return c.json(result);
});

app.get('/api/history', (c) => c.json([]));

app.post('/api/history', (c) => c.json({ saved: false, message: 'coming soon' }));

export default handle(app);
