import { A } from '@solidjs/router';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import SiteFooter from '../components/SiteFooter';

const guidelines = [
  ['Respectă oamenii', 'Nu publica amenințări, hărțuire, atacuri țintite sau conținut care încurajează ura împotriva unei persoane ori comunități. Dezacordul este firesc; abuzul nu este.'],
  ['Publică autentic', 'Nu impersona alte persoane, nu manipula artificial interacțiunile și nu folosi platforma pentru spam, fraude sau linkuri înșelătoare.'],
  ['Protejează datele personale', 'Nu distribui fără acord adrese, numere de telefon, documente, conversații private sau alte informații care pot pune pe cineva în pericol.'],
  ['Păstrează conținutul sigur', 'Nu încărca programe malițioase, materiale ilegale ori conținut destinat exploatării. Respectă drepturile de autor și publică doar ceea ce ai dreptul să distribui.'],
];

export default function CommunityGuidelines() {
  return (
    <>
      <PageMeta
        title="Regulile comunității — Media"
        description="Regulile simple care păstrează comunitatea Media sigură, autentică și primitoare pentru toată lumea."
        canonicalPath="/reguli"
      />
      <Navbar />
      <main class="public-page">
        <section class="public-hero public-hero-compact app-container" aria-labelledby="guidelines-title">
          <p class="eyebrow">Regulile comunității</p>
          <h1 id="guidelines-title">Libertatea de a vorbi vine cu grija față de ceilalți.</h1>
          <p>Aceste principii se aplică postărilor, comentariilor, imaginilor, profilurilor și mesajelor. Ele există pentru ca Media să rămână un loc în care oamenii pot participa fără teamă.</p>
        </section>

        <section class="public-section app-container" aria-label="Principii de conduită">
          <div class="guidelines-list">
            {guidelines.map(([title, copy], index) => (
              <article class="surface guideline-card">
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h2>{title}</h2>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section class="public-section app-container">
          <div class="surface public-callout">
            <div>
              <p class="sidebar-eyebrow">Standard comun</p>
              <h2>Construim tonul comunității împreună.</h2>
              <p>Înainte să publici, întreabă-te dacă mesajul este adevărat, necesar și formulat cu respect.</p>
            </div>
            <A href="/register" class="btn btn-primary">Creează un cont</A>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
