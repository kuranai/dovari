const targetUrl = process.argv[2] ?? process.env.DOVARI_SMOKE_URL;
const accessToken = process.env.DOVARI_SMOKE_ACCESS_JWT;

if (!targetUrl) {
  console.error('Usage: npm run release:smoke -- https://your-dovari-host.example');
  process.exitCode = 1;
} else {
  const baseUrl = new URL(targetUrl);
  baseUrl.pathname = baseUrl.pathname.replace(/\/$/u, '');

  async function request(path, headers = {}) {
    return fetch(new URL(path, baseUrl), {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  }

  async function main() {
    const health = await request('/api/health');
    if (health.status !== 200) {
      throw new Error(`Public health check returned HTTP ${health.status}.`);
    }

    const healthBody = await health.json();
    if (healthBody.status !== 'ok') {
      throw new Error('Public health check did not return { status: "ok" }.');
    }

    const root = await request('/');
    if (root.status !== 302 || root.headers.get('location') !== '/app') {
      throw new Error('Public root did not redirect to /app.');
    }

    for (const path of ['/app', '/api/private/pages']) {
      const response = await request(path);
      if (response.ok) {
        throw new Error(`${path} was reachable without Access authentication.`);
      }
      const acceptedStatuses = new Set([401, 403, 503]);
      if (
        !acceptedStatuses.has(response.status) &&
        (response.status < 300 || response.status >= 400)
      ) {
        throw new Error(`${path} returned an unexpected HTTP ${response.status}.`);
      }
    }

    console.log('Fail-closed check passed: private app and API reject unauthenticated requests.');

    if (!accessToken) {
      console.log(
        'No DOVARI_SMOKE_ACCESS_JWT supplied; authenticated private smoke was skipped after the fail-closed check.',
      );
      return;
    }

    const privatePages = await request('/api/private/pages', {
      'Cf-Access-Jwt-Assertion': accessToken,
    });
    if (privatePages.status !== 200) {
      throw new Error(`Authenticated private Pages smoke returned HTTP ${privatePages.status}.`);
    }

    const body = await privatePages.json();
    if (!Array.isArray(body.pages)) {
      throw new Error('Authenticated private Pages smoke returned an invalid response.');
    }

    console.log(
      `Authenticated private smoke passed: ${body.pages.length} page summaries returned.`,
    );
  }

  main().catch((error) => {
    console.error(
      `Release smoke failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
