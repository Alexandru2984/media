// Prefer same-origin URLs in production; the development server proxies these.
const VITE_API_URL = import.meta.env?.VITE_API_URL || '';
const BASE_URL = VITE_API_URL
  ? VITE_API_URL.replace(/\/api\/?$/, '')
  : '';

export const encodePathSegment = (value) => encodeURIComponent(String(value));

export const withQuery = (path, parameters) => {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null) query.set(name, String(value));
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
};

export const profilePath = (userId) => `/profile/${encodePathSegment(userId)}`;

export const postPath = (postId) => `/post/${encodePathSegment(postId)}`;

export const loginPath = (returnPath = '/') => withQuery('/login', { next: returnPath });

export const safeReturnPath = (value, fallback = '/') => {
  if (typeof value !== 'string'
      || value.length === 0
      || value.length > 1024
      || !value.startsWith('/')
      || value.startsWith('//')
      || value.includes('\\')
      || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  try {
    const target = new URL(value, 'https://media.micutu.com');
    if (target.origin !== 'https://media.micutu.com') return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
};

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
