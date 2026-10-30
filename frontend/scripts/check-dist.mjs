import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distRoot = resolve(frontendRoot, 'dist');
const assetsRoot = resolve(distRoot, 'assets');
const publicRoutes = ['', 'despre', 'reguli', 'confidentialitate', 'termeni', 'ajutor'];
const budgets = {
  entryJavaScript: 130_000,
  stylesheet: 85_000,
  totalJavaScript: 300_000,
};

function requireMatch(value, pattern, message) {
  const match = value.match(pattern);
  if (!match) throw new Error(message);
  return match;
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

if (entrySize > budgets.entryJavaScript) {
  throw new Error(`Entry JavaScript exceeds ${budgets.entryJavaScript} bytes: ${entrySize}`);
}
if (stylesheetSize > budgets.stylesheet) {
  throw new Error(`Stylesheet exceeds ${budgets.stylesheet} bytes: ${stylesheetSize}`);
}
if (totalJavaScriptSize > budgets.totalJavaScript) {
  throw new Error(`Total JavaScript exceeds ${budgets.totalJavaScript} bytes: ${totalJavaScriptSize}`);
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
  if (html.includes('noindex')) {
    throw new Error(`Public route /${route} must remain indexable`);
  }
}

const sitemap = await readFile(resolve(distRoot, 'sitemap.xml'), 'utf8');
const sitemapUrlCount = sitemap.match(/<loc>/g)?.length ?? 0;
if (sitemapUrlCount !== publicRoutes.length) {
  throw new Error(`Sitemap URL count mismatch: expected ${publicRoutes.length}, found ${sitemapUrlCount}`);
}

console.log(JSON.stringify({
  entry_js_bytes: entrySize,
  stylesheet_bytes: stylesheetSize,
  total_js_bytes: totalJavaScriptSize,
  route_chunks: javaScriptFiles.length - 1,
  public_pages: publicRoutes.length,
}));
