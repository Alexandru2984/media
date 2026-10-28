import { createEffect, onCleanup } from 'solid-js';

const SITE_URL = 'https://media.micutu.com';
const SOCIAL_IMAGE_URL = `${SITE_URL}/og/media-social-preview.png`;
const DEFAULT_TITLE = 'Media — conversații care contează';
const DEFAULT_DESCRIPTION = 'Descoperă o comunitate online pentru idei, imagini și conversații autentice. Creează gratuit un profil pe Media.';

function setMeta(selector, content) {
  const element = document.head.querySelector(selector);
  if (element) element.setAttribute('content', content);
}

function buildStructuredData({ title, description, canonicalUrl, schemaType }) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: title,
    description,
    url: canonicalUrl,
    inLanguage: 'ro-RO',
    image: SOCIAL_IMAGE_URL,
  };

  if (schemaType !== 'WebSite') {
    structuredData.isPartOf = {
      '@type': 'WebSite',
      name: 'Media',
      url: `${SITE_URL}/`,
    };
  }

  return structuredData;
}

function setStructuredData(structuredData) {
  const element = document.head.querySelector('#page-structured-data');
  if (element) element.textContent = structuredData ? JSON.stringify(structuredData) : '';
}

function setCanonicalLinks(canonicalUrl) {
  document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', canonicalUrl);
  document.head.querySelector('link[rel="alternate"][hreflang="ro-RO"]')?.setAttribute('href', canonicalUrl);
  document.head.querySelector('link[rel="alternate"][hreflang="x-default"]')?.setAttribute('href', canonicalUrl);
}

export default function PageMeta(props) {
  createEffect(() => {
    const title = props.title || DEFAULT_TITLE;
    const description = props.description || DEFAULT_DESCRIPTION;
    const canonicalPath = props.canonicalPath || '/';
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;
    const schemaType = props.schemaType || 'WebPage';
    const robots = props.noIndex
      ? 'noindex, nofollow, noarchive'
      : 'index, follow, max-image-preview:large';

    document.title = title;
    setCanonicalLinks(canonicalUrl);
    setMeta('meta[name="description"]', description);
    setMeta('meta[name="robots"]', robots);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    setStructuredData(props.noIndex
      ? null
      : buildStructuredData({ title, description, canonicalUrl, schemaType }));
  });

  onCleanup(() => {
    document.title = DEFAULT_TITLE;
    setCanonicalLinks(`${SITE_URL}/`);
    setMeta('meta[name="description"]', DEFAULT_DESCRIPTION);
    setMeta('meta[name="robots"]', 'index, follow, max-image-preview:large');
    setMeta('meta[property="og:title"]', DEFAULT_TITLE);
    setMeta('meta[property="og:description"]', DEFAULT_DESCRIPTION);
    setMeta('meta[property="og:url"]', `${SITE_URL}/`);
    setMeta('meta[name="twitter:title"]', DEFAULT_TITLE);
    setMeta('meta[name="twitter:description"]', DEFAULT_DESCRIPTION);
    setStructuredData(buildStructuredData({
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      canonicalUrl: `${SITE_URL}/`,
      schemaType: 'WebSite',
    }));
  });

  return null;
}
