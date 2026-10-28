import { A } from '@solidjs/router';

export default function SiteFooter() {
  return (
    <footer class="site-footer">
      <div class="app-container site-footer-grid">
        <div>
          <A href="/" class="footer-brand" aria-label="Media — pagina principală">Media</A>
          <p>Un spațiu simplu pentru idei, imagini și conversații autentice.</p>
        </div>
        <nav class="footer-links" aria-label="Navigație secundară">
          <A href="/despre">Despre Media</A>
          <A href="/reguli">Regulile comunității</A>
          <a href="https://github.com/Alexandru2984/media" target="_blank" rel="noreferrer">Codul proiectului</a>
        </nav>
        <p class="footer-meta">© {new Date().getFullYear()} Media</p>
      </div>
    </footer>
  );
}
