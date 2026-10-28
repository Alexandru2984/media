import { A } from '@solidjs/router';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import SiteFooter from '../components/SiteFooter';

const principles = [
  {
    number: '01',
    title: 'Conversația înaintea zgomotului',
    copy: 'Interfața păstrează postările și oamenii în centru, fără mecanisme inutile care să concureze pentru atenția ta.',
  },
  {
    number: '02',
    title: 'Control clar asupra contului',
    copy: 'Profilul, parola și adresa de email pot fi administrate dintr-un singur loc, pe orice dimensiune de ecran.',
  },
  {
    number: '03',
    title: 'Siguranță construită în produs',
    copy: 'Sesiunile sunt protejate în browser, acțiunile sensibile sunt verificate, iar fișierele încărcate trec prin validări stricte.',
  },
];

export default function About() {
  return (
    <>
      <PageMeta
        title="Despre Media — o comunitate pentru conversații autentice"
        description="Află cum este construită Media: o platformă socială românească, simplă, responsive și orientată către conversații autentice."
        canonicalPath="/despre"
      />
      <Navbar />
      <main class="public-page">
        <section class="public-hero app-container" aria-labelledby="about-title">
          <p class="eyebrow">Despre proiect</p>
          <h1 id="about-title">O rețea socială făcută pentru conversații, nu pentru zgomot.</h1>
          <p>Media este o platformă independentă în care poți publica idei și imagini, poți răspunde comunității și poți descoperi oameni noi într-o experiență rapidă și clară.</p>
          <div class="hero-actions">
            <A href="/register" class="btn btn-primary">Intră în comunitate</A>
            <A href="/reguli" class="btn btn-secondary">Vezi regulile</A>
          </div>
        </section>

        <section class="public-section app-container" aria-labelledby="principles-title">
          <div class="section-heading">
            <p class="sidebar-eyebrow">Principiile Media</p>
            <h2 id="principles-title">Mai puțină fricțiune. Mai multă substanță.</h2>
          </div>
          <div class="principles-grid">
            {principles.map((principle) => (
              <article class="surface principle-card">
                <span>{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section class="public-section app-container">
          <div class="surface public-callout">
            <div>
              <p class="sidebar-eyebrow">Construit deschis</p>
              <h2>Produsul evoluează transparent.</h2>
              <p>Codul proiectului este public, iar îmbunătățirile de securitate, performanță și accesibilitate sunt livrate incremental.</p>
            </div>
            <a class="btn btn-secondary" href="https://github.com/Alexandru2984/media" target="_blank" rel="noreferrer">Vezi proiectul pe GitHub</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
