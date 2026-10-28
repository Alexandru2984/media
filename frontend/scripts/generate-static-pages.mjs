import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(frontendRoot, 'dist');
const indexPath = resolve(distRoot, 'index.html');
const socialImage = 'https://media.micutu.com/og/media-social-preview.png';

const routes = [
  {
    path: '/despre',
    title: 'Despre Media — o comunitate pentru conversații autentice',
    description: 'Află cum este construită Media: o platformă socială românească, simplă, responsive și orientată către conversații autentice.',
    schemaType: 'AboutPage',
  },
  {
    path: '/reguli',
    title: 'Regulile comunității — Media',
    description: 'Regulile simple care păstrează comunitatea Media sigură, autentică și primitoare pentru toată lumea.',
    schemaType: 'WebPage',
  },
];

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function replaceMeta(html, attribute, key, content) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}="${escapedKey}")[^>]*>`, 'i');
  const replacement = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}" />`;
  if (!pattern.test(html)) throw new Error(`Missing ${attribute} metadata: ${key}`);
  return html.replace(pattern, replacement);
}

function replaceLink(html, rel, href, hreflang) {
  const languageLookahead = hreflang ? `(?=[^>]*\\bhreflang="${hreflang}")` : '';
  const pattern = new RegExp(`<link\\b(?=[^>]*\\brel="${rel}")${languageLookahead}[^>]*>`, 'i');
  const languageAttribute = hreflang ? ` hreflang="${hreflang}"` : '';
  if (!pattern.test(html)) throw new Error(`Missing ${rel} link${hreflang ? ` for ${hreflang}` : ''}`);
  return html.replace(pattern, `<link rel="${rel}"${languageAttribute} href="${href}" />`);
}

function renderRoute(shell, route) {
  const canonicalUrl = `https://media.micutu.com${route.path}`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': route.schemaType,
    name: route.title,
    description: route.description,
    url: canonicalUrl,
    inLanguage: 'ro-RO',
    image: socialImage,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Media',
      url: 'https://media.micutu.com/',
    },
  };

  let html = shell.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(route.title)}</title>`);
  html = replaceMeta(html, 'name', 'description', route.description);
  html = replaceMeta(html, 'property', 'og:title', route.title);
  html = replaceMeta(html, 'property', 'og:description', route.description);
  html = replaceMeta(html, 'property', 'og:url', canonicalUrl);
  html = replaceMeta(html, 'name', 'twitter:title', route.title);
  html = replaceMeta(html, 'name', 'twitter:description', route.description);
  html = replaceLink(html, 'canonical', canonicalUrl);
  html = replaceLink(html, 'alternate', canonicalUrl, 'ro-RO');
  html = replaceLink(html, 'alternate', canonicalUrl, 'x-default');

  const structuredDataPattern = /<script id="page-structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/i;
  if (!structuredDataPattern.test(html)) throw new Error('Missing page structured data block');
  return html.replace(
    structuredDataPattern,
    `<script id="page-structured-data" type="application/ld+json">${JSON.stringify(structuredData)}</script>`,
  );
}

const shell = await readFile(indexPath, 'utf8');

for (const route of routes) {
  const outputPath = resolve(distRoot, route.path.slice(1), 'index.html');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderRoute(shell, route));
}
