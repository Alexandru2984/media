import { A } from '@solidjs/router';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import CreatePost from '../components/CreatePost';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';
import PageMeta from '../components/PageMeta';
import SiteFooter from '../components/SiteFooter';
import { getImageUrl } from '../utils/urls';

const FEED_PAGE_SIZE = 10;

function LoadingFeed() {
  return (
    <div class="loading-stack" aria-label="Se încarcă postările" aria-busy="true">
      <For each={[1, 2]}>
        {() => (
          <div class="surface skeleton">
            <div class="skeleton-lines">
              <div class="skeleton-line" />
              <div class="skeleton-line" />
              <div class="skeleton-line" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function Landing() {
  return (
    <>
      <main class="landing">
        <section class="landing-hero app-container" aria-labelledby="landing-title">
        <div class="hero-copy">
          <div class="eyebrow">
            <span aria-hidden="true">●</span>
            Comunitatea ta, fără zgomot inutil
          </div>
          <h1 id="landing-title" class="hero-title">
            Oameni reali.<br /><span>Conversații care contează.</span>
          </h1>
          <p class="hero-lead">
            Media este locul în care distribui idei, imagini și momente cu o comunitate construită în jurul conexiunilor autentice.
          </p>
          <div class="hero-actions">
            <A href="/register" class="btn btn-primary">
              Creează un cont
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </A>
            <A href="/login" class="btn btn-secondary">Am deja cont</A>
          </div>
          <div class="hero-proof" aria-label="Avantajele platformei">
            <span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
              Gratuit
            </span>
            <span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 5 6v5c0 4.7 3 8.3 7 10 4-1.7 7-5.3 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
              Cont protejat
            </span>
            <span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
              Simplu de folosit
            </span>
          </div>
        </div>

        <div class="hero-visual" aria-hidden="true">
          <div class="hero-orb" />
          <div class="preview-card preview-card-main">
            <div class="preview-user">
              <span class="avatar-fallback">M</span>
              <div>
                <div class="preview-name">Mara</div>
                <div class="preview-meta">acum 4 minute</div>
              </div>
            </div>
            <p class="preview-copy">Uneori, cele mai bune idei încep cu o conversație simplă.</p>
            <div class="preview-media" />
            <div class="preview-actions"><span>♡ 24 aprecieri</span><span>◯ 8 răspunsuri</span></div>
          </div>
          <div class="preview-card preview-card-small">
            <div class="preview-user">
              <span class="avatar-fallback">A</span>
              <div>
                <div class="preview-name">Andrei</div>
                <div class="preview-meta">Tocmai a publicat</div>
              </div>
            </div>
            <p class="preview-copy">Bun venit într-un feed mai calm.</p>
          </div>
        </div>
        </section>

        <section class="landing-features app-container" aria-labelledby="landing-features-title">
          <div class="section-heading">
            <p class="sidebar-eyebrow">Tot ce ai nevoie</p>
            <h2 id="landing-features-title">O experiență socială simplă, pe orice ecran.</h2>
          </div>
          <div class="principles-grid">
            <article class="surface feature-card">
              <span class="feature-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <h3>Publică fără fricțiune</h3>
              <p>Împărtășește texte și imagini într-un composer rapid, cu validări clare și stări utile.</p>
            </article>
            <article class="surface feature-card">
              <span class="feature-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8" />
                  <path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </span>
              <h3>Descoperă comunitatea</h3>
              <p>Caută oameni și conversații, explorează profiluri și continuă discuția prin comentarii.</p>
            </article>
            <article class="surface feature-card">
              <span class="feature-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="2.5" width="14" height="19" rx="3" stroke="currentColor" stroke-width="1.8" />
                  <path d="M10 18h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </span>
              <h3>Conceput pentru mobil</h3>
              <p>Navigația, feedul și setările rămân clare de la 320 px până la ecrane desktop.</p>
            </article>
          </div>
        </section>

        <section class="landing-journey app-container" aria-labelledby="landing-journey-title">
          <div class="journey-intro">
            <p class="sidebar-eyebrow">De la idee la conversație</p>
            <h2 id="landing-journey-title">Trei pași. Fără manual de utilizare.</h2>
            <p>Media păstrează lucrurile importante la îndemână, ca tu să poți intra direct în conversație.</p>
          </div>
          <ol class="journey-steps">
            <li class="journey-step">
              <span class="journey-number">01</span>
              <div>
                <h3>Creează-ți profilul</h3>
                <p>Alege un nume, confirmă adresa de email și personalizează-ți spațiul.</p>
              </div>
            </li>
            <li class="journey-step">
              <span class="journey-number">02</span>
              <div>
                <h3>Publică ce contează</h3>
                <p>Scrie un gând sau adaugă o imagine, cu feedback clar înainte de publicare.</p>
              </div>
            </li>
            <li class="journey-step">
              <span class="journey-number">03</span>
              <div>
                <h3>Continuă discuția</h3>
                <p>Descoperă postări, apreciază idei și răspunde direct prin comentarii.</p>
              </div>
            </li>
          </ol>
        </section>

        <section class="landing-trust app-container" aria-labelledby="landing-trust-title">
          <div class="trust-panel">
            <div class="trust-copy">
              <p class="trust-eyebrow">Siguranță vizibilă</p>
              <h2 id="landing-trust-title">Controlul contului tău nu stă ascuns într-un meniu.</h2>
              <p>Primești instrumente concrete pentru acces, sesiuni și schimbările importante ale contului.</p>
              <A href="/despre" class="trust-link">
                Cum este construită Media
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </A>
            </div>
            <ul class="trust-list">
              <li>
                <span class="trust-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" stroke-width="1.8" /><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
                </span>
                <div><strong>Sesiuni sub control</strong><span>Vezi sesiunile active și le poți închide de la distanță.</span></div>
              </li>
              <li>
                <span class="trust-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3 5 6v5c0 4.7 3 8.3 7 10 4-1.7 7-5.3 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </span>
                <div><strong>Activitate de securitate</strong><span>Autentificările și modificările sensibile rămân ușor de verificat.</span></div>
              </li>
              <li>
                <span class="trust-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 16.5V19h16v-2.5M12 4v10m0-10L8 8m4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </span>
                <div><strong>Fișiere verificate</strong><span>Imaginile încărcate trec prin limite și validări stricte pe server.</span></div>
              </li>
            </ul>
          </div>
        </section>

        <section class="landing-cta app-container">
          <div class="surface public-callout">
            <div>
              <p class="sidebar-eyebrow">Începe acum</p>
              <h2>Primul mesaj bun poate porni o comunitate.</h2>
              <p>Contul este gratuit, iar profilul tău poate fi gata în mai puțin de un minut.</p>
            </div>
            <A href="/register" class="btn btn-primary">Creează profilul</A>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

export default function Home() {
  const [posts, setPosts] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [loadMoreError, setLoadMoreError] = createSignal('');
  const [error, setError] = createSignal('');
  const [loadedForUser, setLoadedForUser] = createSignal(null);
  const auth = useAuth();

  const loadPosts = async ({ append = false } = {}) => {
    if (append && (loadingMore() || !hasMore())) return;

    try {
      if (append) {
        setLoadingMore(true);
        setLoadMoreError('');
      } else {
        setLoading(true);
        setError('');
        setLoadMoreError('');
      }

      const offset = append ? posts().length : 0;
      const data = await api.getPosts(FEED_PAGE_SIZE, offset);
      if (append) {
        setPosts((currentPosts) => {
          const knownIds = new Set(currentPosts.map((post) => post.id));
          return [...currentPosts, ...data.filter((post) => !knownIds.has(post.id))];
        });
      } else {
        setPosts(data);
      }
      setHasMore(data.length === FEED_PAGE_SIZE);
    } catch (requestError) {
      console.error('Failed to load posts:', requestError);
      if (append) {
        setLoadMoreError('Nu am putut încărca următoarele postări. Încearcă din nou.');
      } else {
        setError('Nu am putut încărca feedul. Verifică conexiunea și încearcă din nou.');
      }
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  createEffect(() => {
    const userId = auth.user()?.id;
    if (!auth.loading() && userId && loadedForUser() !== userId) {
      setLoadedForUser(userId);
      loadPosts();
    }
  });

  return (
    <>
      <PageMeta
        title={auth.isAuthenticated() ? 'Feedul tău — Media' : 'Media — conversații care contează'}
        description="Descoperă o comunitate online pentru idei, imagini și conversații autentice. Creează gratuit un profil pe Media."
        canonicalPath="/"
        schemaType="WebSite"
      />
      <Navbar />
      <Show
        when={!auth.loading()}
        fallback={
          <main class="page-shell app-container">
            <div class="home-grid">
              <div class="feed-column"><LoadingFeed /></div>
            </div>
          </main>
        }
      >
        <Show when={auth.isAuthenticated()} fallback={<Landing />}>
          <main class="page-shell app-container">
            <div class="home-grid">
              <aside class="sidebar sidebar-left" aria-label="Profil rapid">
                <div class="surface sidebar-card">
                  <div class="sidebar-profile">
                    <Show
                      when={auth.user()?.avatar_url}
                      fallback={<span class="avatar-fallback">{auth.user()?.username?.charAt(0).toUpperCase()}</span>}
                    >
                      <img class="avatar" src={getImageUrl(auth.user()?.avatar_url)} alt="" />
                    </Show>
                    <div>
                      <p class="sidebar-eyebrow">Profilul tău</p>
                      <h2 class="sidebar-title">{auth.user()?.username}</h2>
                    </div>
                  </div>
                  <A href={`/profile/${auth.user()?.id}`} class="btn btn-secondary" style={{ width: '100%', 'margin-top': '16px' }}>
                    Vezi profilul
                  </A>
                </div>
              </aside>

              <section class="feed-column" aria-labelledby="feed-title">
                <div class="feed-heading">
                  <div>
                    <h1 id="feed-title">Pentru tine</h1>
                    <p>Idei și momente din comunitate</p>
                  </div>
                  <button type="button" class="icon-button" onClick={loadPosts} aria-label="Reîncarcă feedul" title="Reîncarcă">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                </div>

                <CreatePost onPostCreated={loadPosts} />

                <Show when={loading()}><LoadingFeed /></Show>

                <Show when={!loading() && error()}>
                  <div class="surface state-card" role="alert">
                    <div>
                      <span class="state-icon">
                        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8v5m0 3h.01M10.3 4.2 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
                      </span>
                      <h2>Feed indisponibil</h2>
                      <p>{error()}</p>
                      <button type="button" class="btn btn-primary" onClick={loadPosts} style={{ 'margin-top': '20px' }}>Încearcă din nou</button>
                    </div>
                  </div>
                </Show>

                <Show when={!loading() && !error() && posts().length === 0}>
                  <div class="surface state-card">
                    <div>
                      <span class="state-icon">
                        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v12H8l-4 4V5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
                      </span>
                      <h2>Începe conversația</h2>
                      <p>Feedul este liber. Publică primul gând și dă tonul comunității.</p>
                    </div>
                  </div>
                </Show>

                <Show when={!loading() && !error()}>
                  <div class="feed-list">
                    <For each={posts()}>{(post) => <PostCard post={post} onDelete={() => loadPosts()} onUpdate={() => loadPosts()} />}</For>
                  </div>
                </Show>

                <Show when={!loading() && !error() && posts().length > 0}>
                  <div class="feed-pagination">
                    <Show when={loadMoreError()}>
                      <p class="inline-error" role="alert">{loadMoreError()}</p>
                    </Show>
                    <Show when={hasMore()}>
                      <button
                        type="button"
                        class="btn btn-secondary"
                        onClick={() => loadPosts({ append: true })}
                        disabled={loadingMore()}
                      >
                        {loadingMore() ? 'Se încarcă…' : 'Încarcă mai multe'}
                      </button>
                    </Show>
                  </div>
                </Show>
              </section>

              <aside class="sidebar sidebar-right" aria-label="Despre comunitate">
                <div class="surface sidebar-card">
                  <p class="sidebar-eyebrow">Media</p>
                  <h2 class="sidebar-title">Un spațiu mai bun</h2>
                  <p class="sidebar-copy">Publică responsabil, respectă comunitatea și păstrează conversațiile constructive.</p>
                </div>
                <div class="surface sidebar-card">
                  <p class="sidebar-eyebrow">Sfat</p>
                  <h2 class="sidebar-title">Fă-ți profilul memorabil</h2>
                  <p class="sidebar-copy">Adaugă un avatar și o descriere scurtă ca oamenii să te recunoască ușor.</p>
                </div>
              </aside>
            </div>
          </main>
        </Show>
      </Show>
    </>
  );
}
