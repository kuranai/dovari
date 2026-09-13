import { Hono } from 'hono';

import {
  accessMiddleware,
  apiError,
  requestIdMiddleware,
  securityHeadersMiddleware,
} from './middleware/security';
import { classifyPath, isApiPath } from './routing';
import { registerAssetRoutes } from './assets/routes';
import { registerPageRoutes } from './pages/routes';
import { registerSearchRoutes } from './search/routes';
import type { WorkerApp } from './types';

async function checkBindings(env: WorkerApp['Bindings']) {
  await Promise.all([
    env.DB.prepare('SELECT 1').first(),
    env.ASSETS.head('__dovari_binding_probe__'),
  ]);
}

function fetchStaticAssets(request: Request, assets: Fetcher) {
  const headers = new Headers(request.headers);
  headers.delete('Authorization');
  headers.delete('Cf-Access-Jwt-Assertion');
  headers.delete('Cookie');

  return assets.fetch(new Request(request, { headers }));
}

export function createApp() {
  const app = new Hono<WorkerApp>();

  app.use('*', requestIdMiddleware);
  app.use('*', securityHeadersMiddleware);
  app.use('*', accessMiddleware);

  app.on(['GET', 'HEAD'], '/api/health', async (c) => {
    try {
      await checkBindings(c.env);
      return c.json({ status: 'ok' });
    } catch {
      return apiError(c, 503, 'HEALTH_UNAVAILABLE', 'Service unavailable.');
    }
  });

  registerPageRoutes(app);
  registerAssetRoutes(app);
  registerSearchRoutes(app);

  app.all('*', async (c) => {
    const pathname = new URL(c.req.url).pathname;
    const classification = classifyPath(pathname);

    if (classification.kind === 'private' && classification.area === 'app') {
      if (pathname === '/') {
        return c.redirect('/app', 302);
      }

      return fetchStaticAssets(c.req.raw, c.env.STATIC_ASSETS);
    }

    if (classification.kind === 'static') {
      return fetchStaticAssets(c.req.raw, c.env.STATIC_ASSETS);
    }

    if (isApiPath(pathname)) {
      return apiError(c, 404, 'NOT_FOUND', 'Not found.');
    }

    return new Response('Not Found', { status: 404 });
  });

  app.onError((_error, c) => apiError(c, 500, 'INTERNAL_ERROR', 'Internal server error.'));

  return app;
}

const app = createApp();

export { app };
export default app;
