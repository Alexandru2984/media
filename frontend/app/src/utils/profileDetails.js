export const PROFILE_DETAIL_LIMITS = { display_name: 50, pronouns: 30, location: 80 };
const controls = /[\u0000-\u001f\u007f-\u009f]/u;
export const profileTextLength = (value) => [...String(value).trim()].length;
export const profileLineIsValid = (value, limit) => typeof value === 'string' && profileTextLength(value) <= limit && !controls.test(value);
export function publicWebsite(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed) || controls.test(value) || /\s|\\/u.test(trimmed) || new TextEncoder().encode(trimmed).length > 512) return null;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/\.+$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 512
      || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')
      || ['local', 'localhost', 'internal', 'invalid', 'test'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
    return url.href;
  } catch { return null; }
}
export const profileDetailsFrom = (profile) => Object.fromEntries(['display_name', 'pronouns', 'location', 'website_url'].map((key) => [key, profile?.[key] || '']));
export function profileDetailsAreValid(details) {
  return Object.entries(PROFILE_DETAIL_LIMITS).every(([key, limit]) => profileLineIsValid(details[key], limit))
    && (details.website_url === '' || (details.website_url.trim() === '' && !controls.test(details.website_url)) || Boolean(publicWebsite(details.website_url)));
}
export const profileCoreIsValid = (username, bio) => profileLineIsValid(username, 32) && profileTextLength(username) >= 2
  && profileTextLength(bio) <= 240 && !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(bio.trim());
