import { createEffect, onCleanup } from 'solid-js';

const SITE_URL = 'https://media.micutu.com';
const DEFAULT_TITLE = 'Media — comunitatea ta online';
const DEFAULT_DESCRIPTION = 'Conectează-te, distribuie postări și imagini și participă la conversații pe Media.';

function setMeta(selector, content) {
  const element = document.head.querySelector(selector);
  if (element) element.setAttribute('content', content);
}

export default function PageMeta(props) {
  createEffect(() => {
    const title = props.title || DEFAULT_TITLE;
    const description = props.description || DEFAULT_DESCRIPTION;
    const canonicalPath = props.canonicalPath || '/';
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;
    const robots = props.noIndex
      ? 'noindex, nofollow, noarchive'
      : 'index, follow, max-image-preview:large';

    document.title = title;
    document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', canonicalUrl);
    setMeta('meta[name="description"]', description);
    setMeta('meta[name="robots"]', robots);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
  });

  onCleanup(() => {
    document.title = DEFAULT_TITLE;
    document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', `${SITE_URL}/`);
    setMeta('meta[name="description"]', DEFAULT_DESCRIPTION);
    setMeta('meta[name="robots"]', 'index, follow, max-image-preview:large');
    setMeta('meta[property="og:title"]', DEFAULT_TITLE);
    setMeta('meta[property="og:description"]', DEFAULT_DESCRIPTION);
    setMeta('meta[property="og:url"]', `${SITE_URL}/`);
    setMeta('meta[name="twitter:title"]', DEFAULT_TITLE);
    setMeta('meta[name="twitter:description"]', DEFAULT_DESCRIPTION);
  });

  return null;
}
