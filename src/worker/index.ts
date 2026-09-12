import { Hono } from 'hono';

import { classifyPath } from './routing';

type Bindings = CloudflareBindings;

const app = new Hono<{ Bindings: Bindings }>();

async function checkBindings(env: Bindings) {
  await Promise.all([
    env.DB.prepare('SELECT 1').first(),
    env.ASSETS.head('__dovari_binding_probe__'),
  ]);
}

app.on(['GET', 'HEAD'], '/api/health', async (c) => {
  try {
    await checkBindings(c.env);
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'unavailable' }, 503);
  }
});

app.all('*', async (c) => {
  const pathname = new URL(c.req.url).pathname;
  const classification = classifyPath(pathname);

  if (classification.kind === 'private' && classification.area === 'app') {
    if (pathname === '/') {
      return c.redirect('/app', 302);
    }

    return c.env.STATIC_ASSETS.fetch(c.req.raw);
  }

  if (classification.kind === 'static') {
    return c.env.STATIC_ASSETS.fetch(c.req.raw);
  }

  return new Response('Not Found', { status: 404 });
});

export default app;
