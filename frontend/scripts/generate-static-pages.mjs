import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(frontendRoot, 'dist');
const indexPath = resolve(distRoot, 'index.html');
const socialImage = 'https://media.micutu.com/og/media-social-preview.png';
const rootStart = '<!--media-app-root-start-->';
const rootEnd = '<!--media-app-root-end-->';

const routes = [
  {
    path: '/',
    lastModified: '2026-10-28',
    changeFrequency: 'daily',
    title: 'Media — conversații care contează',
    description: 'Descoperă o comunitate online pentru idei, imagini și conversații autentice. Creează gratuit un profil pe Media.',
    schemaType: 'WebSite',
    eyebrow: 'Comunitate independentă',
    heading: 'Un loc mai calm pentru idei, imagini și conversații autentice.',
    sections: [
      ['Publică și conversează', 'Creează postări, distribuie imagini și participă la discuții într-o interfață rapidă și responsive.'],
      ['Alege-ți audiența', 'Folosește un profil public sau privat și controlează relațiile, blocările și preferințele de notificare.'],
      ['Păstrează controlul', 'Administrează sesiunile, exportă datele și folosește centrul privat de siguranță atunci când ai nevoie.'],
    ],
  },
  {
    path: '/despre',
    lastModified: '2026-10-28',
    changeFrequency: 'monthly',
    title: 'Despre Media — o comunitate pentru conversații autentice',
    description: 'Află cum este construită Media: o platformă socială românească, simplă, responsive și orientată către conversații autentice.',
    schemaType: 'AboutPage',
    eyebrow: 'Despre proiect',
    heading: 'O rețea socială făcută pentru conversații, nu pentru zgomot.',
    sections: [
      ['Conversația înaintea zgomotului', 'Interfața păstrează postările și oamenii în centru, fără mecanisme inutile care să concureze pentru atenție.'],
      ['Control clar asupra contului', 'Profilul, sesiunile, parola, vizibilitatea și datele pot fi administrate dintr-un singur loc.'],
      ['Siguranță construită în produs', 'Controalele de acces, raportările private și auditul de moderare sunt aplicate pe server.'],
    ],
  },
  {
    path: '/reguli',
    lastModified: '2026-10-30',
    changeFrequency: 'monthly',
    title: 'Regulile comunității — Media',
    description: 'Regulile simple care păstrează comunitatea Media sigură, autentică și primitoare pentru toată lumea.',
    schemaType: 'WebPage',
    eyebrow: 'Regulile comunității',
    heading: 'Libertatea de a vorbi vine cu grija față de ceilalți.',
    sections: [
      ['Respectă oamenii', 'Nu publica amenințări, hărțuire, atacuri țintite sau conținut care încurajează ura.'],
      ['Publică autentic', 'Nu impersona alte persoane și nu folosi platforma pentru spam, fraude sau linkuri înșelătoare.'],
      ['Protejează datele personale', 'Nu distribui fără acord informații care pot pune pe cineva în pericol.'],
    ],
  },
  {
    path: '/confidentialitate',
    lastModified: '2026-11-02',
    changeFrequency: 'monthly',
    title: 'Confidențialitate și date personale — Media',
    description: 'Află ce date prelucrează Media, cum sunt protejate și ce controale ai pentru vizibilitate, export și ștergere.',
    schemaType: 'WebPage',
    eyebrow: 'Confidențialitate',
    heading: 'Datele tale trebuie să rămână explicabile și controlabile.',
    sections: [
      ['Date și scopuri', 'Media prelucrează date de cont, conținut, relații, sesiuni și evenimente de siguranță pentru a furniza și proteja serviciul.'],
      ['Vizibilitate', 'Conturile private limitează conținutul la proprietar și urmăritorii acceptați, iar raportările rămân private.'],
      ['Profiluri și linkuri publice', 'Profilul de bază poate fi deschis fără autentificare, inclusiv pentru conturile private, dar nu intră în sitemap și are instrucțiuni de neindexare; preview-ul folosește imaginea generică Media.'],
      ['Linkuri de postare', 'Postările au linkuri directe fără cache și fără indexare în motoare de căutare; serviciile externe pot păstra propriul preview după distribuire.'],
      ['Stocare temporară în browser', 'Schițele păstrează numai textul în sessionStorage, separat per cont și filă, pentru maximum 24 de ore; imaginile nu sunt incluse.'],
      ['Control și ștergere', 'Poți administra sesiunile și preferințele, descărca un export JSON și șterge permanent contul.'],
    ],
  },
  {
    path: '/termeni',
    lastModified: '2026-10-30',
    changeFrequency: 'monthly',
    title: 'Termeni de utilizare — Media',
    description: 'Condițiile clare pentru folosirea Media, publicarea conținutului, conduită, moderare și închiderea contului.',
    schemaType: 'WebPage',
    eyebrow: 'Termeni de utilizare',
    heading: 'Reguli clare pentru un produs construit responsabil.',
    sections: [
      ['Conținutul tău', 'Rămâi responsabil pentru ceea ce publici și acorzi numai permisiunea tehnică necesară afișării conținutului.'],
      ['Conduită', 'Hărțuirea, impersonarea, frauda, spamul, accesul neautorizat și ocolirea controalelor nu sunt acceptate.'],
      ['Închiderea contului', 'Îți poți exporta datele și șterge contul după o confirmare explicită protejată prin parolă.'],
    ],
  },
  {
    path: '/ajutor',
    lastModified: '2026-10-30',
    changeFrequency: 'monthly',
    title: 'Ajutor și siguranța contului — Media',
    description: 'Ghid pentru conectare, profil privat, notificări, raportare, exportul datelor și ștergerea contului Media.',
    schemaType: 'WebPage',
    eyebrow: 'Centru de ajutor',
    heading: 'Răspunsuri directe pentru contul și siguranța ta.',
    sections: [
      ['Acces la cont', 'Sesiunile folosesc cookie-uri HttpOnly. Verificarea și recuperarea prin email sunt afectate momentan de incidentul SMTP Brevo.'],
      ['Notificări și vizibilitate', 'Poți controla separat notificările viitoare și poți limita conținutul prin profilul privat.'],
      ['Siguranță și date', 'Blocarea, silențierea, raportarea, exportul și ștergerea sunt disponibile din interfața contului.'],
    ],
  },
];

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderSitemap() {
  const entries = routes.map((route) => {
    const canonicalUrl = `https://media.micutu.com${route.path}`;
    return `  <url>
    <loc>${escapeXml(canonicalUrl)}</loc>
    <lastmod>${route.lastModified}</lastmod>
    <changefreq>${route.changeFrequency}</changefreq>
  </url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
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
    dateModified: route.lastModified,
  };
  if (route.schemaType !== 'WebSite') {
    structuredData.isPartOf = {
      '@type': 'WebSite',
      name: 'Media',
      url: 'https://media.micutu.com/',
    };
  }

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
  html = html.replace(
    structuredDataPattern,
    `<script id="page-structured-data" type="application/ld+json">${JSON.stringify(structuredData)}</script>`,
  );

  const rootPattern = /<!--media-app-root-start-->[\s\S]*?<!--media-app-root-end-->/i;
  if (!rootPattern.test(html)) throw new Error('Missing bounded application root');
  const staticSections = route.sections.map(([title, copy], index) => `
    <article class="surface guideline-card">
      <span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></div>
    </article>`).join('');
  const staticPage = `${rootStart}<div id="root">
  <main class="public-page" id="main-content">
    <section class="public-hero public-hero-compact app-container">
      <p class="eyebrow">${escapeHtml(route.eyebrow)}</p>
      <h1>${escapeHtml(route.heading)}</h1>
      <p>${escapeHtml(route.description)}</p>
    </section>
    <section class="public-section app-container" aria-label="Rezumatul paginii">
      <div class="guidelines-list">${staticSections}
      </div>
    </section>
  </main>
</div>${rootEnd}`;
  return html.replace(rootPattern, staticPage);
}

const shell = await readFile(indexPath, 'utf8');

for (const route of routes) {
  const outputPath = route.path === '/'
    ? indexPath
    : resolve(distRoot, route.path.slice(1), 'index.html');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderRoute(shell, route));
}

await writeFile(resolve(distRoot, 'sitemap.xml'), renderSitemap());
