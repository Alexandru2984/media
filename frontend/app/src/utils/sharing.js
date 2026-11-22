export function buildShareUrl(path, origin) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(path)) {
    throw new Error('Invalid sharing path');
  }
  const base = new URL(origin);
  const url = new URL(path, base);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password
    || url.origin !== base.origin || url.pathname !== path || url.search || url.hash
    || !/^\/(profile|post)\/[^/]+$/.test(url.pathname)) {
    throw new Error('Invalid sharing path');
  }
  return url.href;
}

export async function shareInternalLink(path, title, environment = globalThis) {
  const url = buildShareUrl(path, environment.location.origin);
  if (typeof environment.navigator?.share === 'function') {
    try {
      await environment.navigator.share({ title, url });
      return { status: 'shared', url };
    } catch (error) {
      if (error?.name === 'AbortError') return { status: 'cancelled', url };
    }
  }
  try {
    await environment.navigator.clipboard.writeText(url);
    return { status: 'copied', url };
  } catch {
    return { status: 'manual', url };
  }
}
