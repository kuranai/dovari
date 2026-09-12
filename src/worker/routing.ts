export type RouteClassification =
  | { kind: 'health' }
  | { kind: 'private'; area: 'app' | 'api' }
  | { kind: 'public'; area: 'page' | 'api' }
  | { kind: 'static' }
  | { kind: 'unknown' };

function isPathOrChild(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isStaticAssetPath(pathname: string) {
  return pathname.startsWith('/assets/') || /\/[^/]+\.[^/]+$/.test(pathname);
}

export function classifyPath(pathname: string): RouteClassification {
  if (pathname === '/api/health') {
    return { kind: 'health' };
  }

  if (isPathOrChild(pathname, '/app') || pathname === '/') {
    return { kind: 'private', area: 'app' };
  }

  if (isPathOrChild(pathname, '/api/private')) {
    return { kind: 'private', area: 'api' };
  }

  if (isPathOrChild(pathname, '/p')) {
    return { kind: 'public', area: 'page' };
  }

  if (isPathOrChild(pathname, '/api/public')) {
    return { kind: 'public', area: 'api' };
  }

  if (isStaticAssetPath(pathname)) {
    return { kind: 'static' };
  }

  return { kind: 'unknown' };
}
