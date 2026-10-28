import { A } from '@solidjs/router';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import SiteFooter from '../components/SiteFooter';

export default function NotFound() {
  return (
    <>
      <PageMeta
        title="Pagina nu a fost găsită — Media"
        description="Adresa accesată nu corespunde unei pagini disponibile pe Media."
        canonicalPath="/404"
        noIndex
      />
      <Navbar />
      <main class="not-found app-container">
        <div class="not-found-code" aria-hidden="true">404</div>
        <p class="eyebrow">Ai ajuns în afara feedului</p>
        <h1>Pagina pe care o cauți nu există.</h1>
        <p>Este posibil ca adresa să fie greșită sau conținutul să nu mai fie disponibil.</p>
        <div class="hero-actions">
          <A href="/" class="btn btn-primary">Înapoi la Media</A>
          <A href="/despre" class="btn btn-secondary">Află despre proiect</A>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
