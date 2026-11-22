import { A } from '@solidjs/router';
import { createSignal, For } from 'solid-js';
import SiteFooter from './SiteFooter';

const conversations = [
  { topic: 'Fotografie', tag: '#fotografie', title: 'Orașul arată altfel când mergi pe jos.', copy: 'O lumină bună, o stradă nouă, un cadru pe care aproape l-ai ratat. Ce ai fotografiat azi?', color: 'photo' },
  { topic: 'Tehnologie', tag: '#tehnologie', title: 'Ce construiești în timpul liber?', copy: 'Un proiect mic, o idee ambițioasă sau ceva făcut doar din curiozitate. Aici e loc și pentru lucruri neterminate.', color: 'tech' },
  { topic: 'Cărți', tag: '#cărți', title: 'Cartea pe care ai împrumuta-o unui prieten.', copy: 'Nu neapărat un bestseller. Doar o poveste care a rămas cu tine, mult după ultima pagină.', color: 'books' },
  { topic: 'În aer liber', tag: '#natură', title: 'Un weekend fără notificări.', copy: 'O potecă, un parc sau cafeaua băută afară. Unde mergi când ai nevoie de o pauză?', color: 'outside' },
];

export default function Landing() {
  const [selected, setSelected] = createSignal(0);
  const conversation = () => conversations[selected()];

  return (
    <>
      <main class="editorial-landing">
        <div class="app-container">
          <div class="edition-line"><span>Un spațiu social independent</span><span>Idei. Oameni. Perspective.</span></div>
          <section class="editorial-hero" aria-labelledby="landing-title">
            <div class="editorial-intro">
              <p class="editorial-kicker">Bine ai venit pe Media</p>
              <h1 id="landing-title">Internetul e mare.<br /><em>Fă-ți loc.</em></h1>
              <p class="editorial-lead">Pentru gândul care nu încape într-un story. Pentru o fotografie, o întrebare bună și oamenii cu care ai ce vorbi.</p>
              <div class="editorial-actions">
                <A href="/register" class="btn btn-primary">Intră în comunitate</A>
                <A href="/login" class="editorial-text-link">Ai cont? Conectează-te</A>
              </div>
              <p class="editorial-note">Cont gratuit. Tu alegi pe cine urmărești.</p>
            </div>
            <div class="conversation-cover" aria-hidden="true">
              <div class="cover-topline"><span>MEDIA / ÎNTRE OAMENI</span><span>Deschis la idei</span></div>
              <svg class="cover-art" viewBox="0 0 480 300" fill="none">
                <path d="M25 240C25 117 137 26 240 26s215 91 215 214" stroke="currentColor" stroke-width="1" />
                <path d="M57 240C57 134 151 58 240 58s183 76 183 182M89 240c0-88 76-150 151-150s151 62 151 150M121 240c0-69 57-118 119-118s119 49 119 118M153 240c0-50 39-86 87-86s87 36 87 86M185 240c0-31 23-54 55-54s55 23 55 54" stroke="currentColor" stroke-width="1" />
                <path d="M18 241h444M240 12v271" stroke="currentColor" stroke-width="1" opacity=".4" />
                <circle cx="240" cy="240" r="24" fill="#c9ee83" stroke="none" />
                <circle cx="119" cy="123" r="12" fill="#f4a184" stroke="none" />
                <circle cx="375" cy="164" r="8" fill="currentColor" stroke="none" />
              </svg>
              <div class="cover-title">O idee bună<br />își găsește <em>oamenii.</em></div>
              <div class="cover-bottomline"><span>Fiecare perspectivă adaugă ceva.</span><span>m.</span></div>
            </div>
          </section>

          <section class="conversation-sampler" aria-labelledby="sampler-title">
            <div class="sampler-heading"><h2 id="sampler-title">De unde începe o conversație?</h2><p>Alege un subiect. Vezi o idee de pornire.</p></div>
            <div class="topic-switches" role="group" aria-label="Alege un exemplu de conversație">
              <For each={conversations}>{(item, index) => (
                <button type="button" aria-pressed={selected() === index()} class={selected() === index() ? 'is-active' : ''} onClick={() => setSelected(index())}>{item.topic}</button>
              )}</For>
            </div>
            <div class={`sample-conversation sample-${conversation().color}`} aria-live="polite" aria-atomic="true">
              <div class="sample-label"><span>{conversation().tag}</span><small>Exemplu de conversație</small></div>
              <div class="sample-copy"><h3>{conversation().title}</h3><p>{conversation().copy}</p></div>
              <A href="/register" class="editorial-text-link">Adaugă perspectiva ta</A>
            </div>
          </section>

          <section class="editorial-principles" aria-labelledby="principles-title">
            <div class="editorial-section-intro"><p class="editorial-kicker">Mai aproape de ce te interesează</p><h2 id="principles-title">Un feed cu care<br /><em>ai ceva în comun.</em></h2><A href="/despre" class="editorial-text-link">Cunoaște proiectul</A></div>
            <div class="editorial-feature-list">
              <article><h3>Oamenii tăi. În ordinea firească.</h3><p>Urmărește oameni care te inspiră. Feedul „Urmărești” aduce postările lor în ordine cronologică.</p></article>
              <article><h3>Un loc pentru ce vrei să păstrezi.</h3><p>Salvează postările la care vrei să revii. Colecția ta rămâne privată, la îndemână și pe telefon.</p></article>
              <article><h3>Limitele le stabilești tu.</h3><p>Alege un cont privat, aprobă urmăritorii și ascunde ce nu vrei în feed. Ai și opțiuni de blocare și raportare.</p></article>
            </div>
          </section>

          <section class="editorial-invitation" aria-labelledby="invitation-title"><div><p class="editorial-kicker">Nu trebuie să ai ceva spectaculos de spus.</p><h2 id="invitation-title">Începe cu <em>un salut.</em></h2></div><A href="/register" class="btn btn-primary">Creează-ți contul</A></section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
