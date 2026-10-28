// Prefer same-origin URLs in production; the development server proxies these.
const BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
  : '';

export const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${BASE_URL}${path}`;
};

// Email links place one-time secrets in the URL fragment, which browsers never
// send to the web server. Query-string support keeps already-issued links valid.
// In both cases, scrub the secret from history before the first network request.
export const consumeOneTimeToken = () => {
  if (typeof window === 'undefined') return '';

  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const token = url.searchParams.get('token') || fragment.get('token') || '';
  const containedSecret = url.searchParams.has('token') || fragment.has('token');

  if (containedSecret) {
    url.searchParams.delete('token');
    url.hash = '';
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  }

  return token;
};

export const API_BASE_URL = BASE_URL;
