import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distRoot = resolve(frontendRoot, 'dist');
const assetsRoot = resolve(distRoot, 'assets');
const publicRoutes = ['', 'despre', 'reguli', 'confidentialitate', 'termeni', 'ajutor'];
const requiredRouteCopy = new Map([
  ['confidentialitate', 'Stocare temporară în browser'],
]);
const budgets = {
  entryJavaScript: 130_000,
  stylesheet: 85_000,
  totalJavaScript: 300_000,
};
const requiredPwaIcons = [
  { src: '/icons/icon-192.png', size: 192, purpose: 'any' },
  { src: '/icons/icon-512.png', size: 512, purpose: 'any' },
  { src: '/icons/icon-maskable-512.png', size: 512, purpose: 'maskable' },
];

function requireMatch(value, pattern, message) {
  const match = value.match(pattern);
  if (!match) throw new Error(message);
  return match;
}

function readPngSize(buffer, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${label} is not a valid PNG with an IHDR header`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const rootHtml = await readFile(resolve(distRoot, 'index.html'), 'utf8');
const entryName = requireMatch(
  rootHtml,
  /<script\b[^>]*\bsrc="\/assets\/(index-[^"]+\.js)"/i,
  'Missing hashed JavaScript entry in generated index.html',
)[1];
const stylesheetName = requireMatch(
  rootHtml,
  /<link\b[^>]*\bhref="\/assets\/(index-[^"]+\.css)"/i,
  'Missing hashed stylesheet in generated index.html',
)[1];

const assetEntries = await readdir(assetsRoot, { withFileTypes: true });
if (assetEntries.some((entry) => entry.isFile() && entry.name.endsWith('.map'))) {
  throw new Error('Production source maps must not be published');
}

const javaScriptFiles = assetEntries.filter((entry) => entry.isFile() && entry.name.endsWith('.js'));
const javaScriptSizes = await Promise.all(
  javaScriptFiles.map(async (entry) => (await stat(resolve(assetsRoot, entry.name))).size),
);
const entrySize = (await stat(resolve(assetsRoot, entryName))).size;
const stylesheetSize = (await stat(resolve(assetsRoot, stylesheetName))).size;
const totalJavaScriptSize = javaScriptSizes.reduce((total, size) => total + size, 0);
const entryJavaScript = await readFile(resolve(assetsRoot, entryName), 'utf8');

if (!rootHtml.includes(
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180"',
)) {
  throw new Error('Missing the 180x180 Apple touch icon link');
}
if (!rootHtml.includes('<meta name="mobile-web-app-capable" content="yes"')) {
  throw new Error('Missing mobile web-app metadata');
}

const manifest = JSON.parse(await readFile(resolve(distRoot, 'manifest.webmanifest'), 'utf8'));
if (manifest.id !== '/'
    || manifest.start_url !== '/'
    || manifest.scope !== '/'
    || manifest.display !== 'standalone') {
  throw new Error('Web manifest navigation or display scope is invalid');
}
if (manifest.theme_color !== '#2563eb' || manifest.background_color !== '#f5f7fb') {
  throw new Error('Web manifest colors do not match the application shell');
}
for (const requiredIcon of requiredPwaIcons) {
  const manifestIcon = manifest.icons?.find((icon) => icon.src === requiredIcon.src);
  if (!manifestIcon
      || manifestIcon.type !== 'image/png'
      || manifestIcon.sizes !== `${requiredIcon.size}x${requiredIcon.size}`
      || !manifestIcon.purpose?.split(/\s+/).includes(requiredIcon.purpose)) {
    throw new Error(`Manifest icon metadata is invalid: ${requiredIcon.src}`);
  }
  const iconBuffer = await readFile(resolve(distRoot, requiredIcon.src.slice(1)));
  const dimensions = readPngSize(iconBuffer, requiredIcon.src);
  if (dimensions.width !== requiredIcon.size || dimensions.height !== requiredIcon.size) {
    throw new Error(`Manifest icon dimensions are invalid: ${requiredIcon.src}`);
  }
}
const appleIcon = await readFile(resolve(distRoot, 'icons', 'apple-touch-icon.png'));
const appleIconSize = readPngSize(appleIcon, '/icons/apple-touch-icon.png');
if (appleIconSize.width !== 180 || appleIconSize.height !== 180) {
  throw new Error('Apple touch icon dimensions must be 180x180');
}

for (const runtimeMarker of [
  'skip-link',
  'connection-banner',
  'route-error',
  'REQUEST_TIMEOUT',
  'NETWORK_ERROR',
  'INVALID_RESPONSE',
]) {
  if (!entryJavaScript.includes(runtimeMarker)) {
    throw new Error(`Missing required runtime marker in entry chunk: ${runtimeMarker}`);
  }
}

if (entrySize > budgets.entryJavaScript) {
  throw new Error(`Entry JavaScript exceeds ${budgets.entryJavaScript} bytes: ${entrySize}`);
}
if (stylesheetSize > budgets.stylesheet) {
  throw new Error(`Stylesheet exceeds ${budgets.stylesheet} bytes: ${stylesheetSize}`);
}
if (totalJavaScriptSize > budgets.totalJavaScript) {
  throw new Error(`Total JavaScript exceeds ${budgets.totalJavaScript} bytes: ${totalJavaScriptSize}`);
}

const sitemap = await readFile(resolve(distRoot, 'sitemap.xml'), 'utf8');
const sitemapEntries = new Map();
for (const match of sitemap.matchAll(
  /<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<changefreq>([^<]+)<\/changefreq>\s*<\/url>/g,
)) {
  const [, url, lastModified, changeFrequency] = match;
  if (sitemapEntries.has(url)) throw new Error(`Duplicate sitemap URL: ${url}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastModified)) {
    throw new Error(`Invalid sitemap lastmod for ${url}: ${lastModified}`);
  }
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(changeFrequency)) {
    throw new Error(`Invalid sitemap changefreq for ${url}: ${changeFrequency}`);
  }
  sitemapEntries.set(url, { lastModified, changeFrequency });
}
if (sitemapEntries.size !== publicRoutes.length) {
  throw new Error(`Sitemap URL count mismatch: expected ${publicRoutes.length}, found ${sitemapEntries.size}`);
}

for (const route of publicRoutes) {
  const htmlPath = route
    ? resolve(distRoot, route, 'index.html')
    : resolve(distRoot, 'index.html');
  const html = await readFile(htmlPath, 'utf8');
  const canonicalUrl = route
    ? `https://media.micutu.com/${route}`
    : 'https://media.micutu.com/';
  if (!html.includes(`<link rel="canonical" href="${canonicalUrl}"`)) {
    throw new Error(`Missing canonical URL for /${route}`);
  }
  if (!html.includes('<main class="public-page" id="main-content">')) {
    throw new Error(`Missing crawlable public content for /${route}`);
  }
  const requiredCopy = requiredRouteCopy.get(route);
  if (requiredCopy && !html.includes(requiredCopy)) {
    throw new Error(`Missing required crawlable disclosure for /${route}`);
  }
  if (html.includes('noindex')) {
    throw new Error(`Public route /${route} must remain indexable`);
  }
  const sitemapEntry = sitemapEntries.get(canonicalUrl);
  if (!sitemapEntry) throw new Error(`Missing sitemap entry for /${route}`);
  const structuredDataText = requireMatch(
    html,
    /<script id="page-structured-data" type="application\/ld\+json">([^<]+)<\/script>/i,
    `Missing structured data for /${route}`,
  )[1];
  const structuredData = JSON.parse(structuredDataText);
  if (structuredData.url !== canonicalUrl || structuredData.dateModified !== sitemapEntry.lastModified) {
    throw new Error(`Structured data and sitemap metadata diverge for /${route}`);
  }
}

console.log(JSON.stringify({
  entry_js_bytes: entrySize,
  stylesheet_bytes: stylesheetSize,
  total_js_bytes: totalJavaScriptSize,
  route_chunks: javaScriptFiles.length - 1,
  public_pages: publicRoutes.length,
  pwa_icons: requiredPwaIcons.length + 1,
}));
