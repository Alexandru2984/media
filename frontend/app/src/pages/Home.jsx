import { A } from '@solidjs/router';
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import CreatePost from '../components/CreatePost';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';
import PageMeta from '../components/PageMeta';
import Landing from '../components/Landing';
import { getImageUrl, profilePath } from '../utils/urls';

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

export default function Home() {
  const [posts, setPosts] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [loadMoreError, setLoadMoreError] = createSignal('');
  const [error, setError] = createSignal('');
  const [loadedForUser, setLoadedForUser] = createSignal(null);
  const [feedMode, setFeedMode] = createSignal('discover');
  const [nextOffset, setNextOffset] = createSignal(0);
  let requestVersion = 0;
  onCleanup(() => { requestVersion += 1; });
  const auth = useAuth();

  const loadPosts = async ({ append = false, mode = feedMode() } = {}) => {
    if (append && (loading() || loadingMore() || !hasMore())) return;
    const userId = auth.user()?.id;
    if (!userId) return;
    const version = ++requestVersion;
    const offset = append ? nextOffset() : 0;

    try {
      if (append) {
        setLoadingMore(true);
        setLoadMoreError('');
      } else {
        setLoading(true);
        setLoadingMore(false);
        setError('');
        setLoadMoreError('');
      }

      const data = mode === 'following'
        ? await api.getFollowingFeed(FEED_PAGE_SIZE, offset)
        : await api.getPosts(FEED_PAGE_SIZE, offset);
      if (version !== requestVersion || auth.user()?.id !== userId) return;
      if (append) {
        setPosts((currentPosts) => {
          const knownIds = new Set(currentPosts.map((post) => post.id));
          return [...currentPosts, ...data.filter((post) => {
            if (knownIds.has(post.id)) return false;
            knownIds.add(post.id);
            return true;
          })];
        });
      } else {
        setPosts(data);
      }
      setNextOffset(offset + data.length);
      setHasMore(data.length === FEED_PAGE_SIZE);
    } catch (requestError) {
      if (version !== requestVersion || auth.user()?.id !== userId) return;
      console.error('Failed to load posts:', requestError);
      if (append) {
        setLoadMoreError('Nu am putut încărca următoarele postări. Încearcă din nou.');
      } else {
        setError('Nu am putut încărca feedul. Verifică conexiunea și încearcă din nou.');
      }
    } finally {
      if (version === requestVersion) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  };

  const selectFeed = (mode) => {
    if (mode === feedMode() || loading()) return;
    setFeedMode(mode);
    setPosts([]);
    setNextOffset(0);
    setHasMore(true);
    void loadPosts({ mode });
  };

  const handlePostCreated = () => {
    setFeedMode('discover');
    void loadPosts({ mode: 'discover' });
  };

  createEffect(() => {
    const userId = auth.user()?.id || null;
    if (!auth.loading() && loadedForUser() !== userId) {
      requestVersion += 1;
      setLoadedForUser(userId);
      setPosts([]);
      setNextOffset(0);
      setHasMore(true);
      setLoadingMore(false);
      if (userId) void loadPosts();
      else setLoading(false);
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
                  <A href={profilePath(auth.user()?.id)} class="btn btn-secondary" style={{ width: '100%', 'margin-top': '16px' }}>
                    Vezi profilul
                  </A>
                </div>
              </aside>

              <section class="feed-column" aria-labelledby="feed-title">
                <div class="feed-heading">
                  <div>
                    <h1 id="feed-title">{feedMode() === 'following' ? 'Urmărești' : 'Pentru tine'}</h1>
                    <p>{feedMode() === 'following' ? 'Noutăți de la oamenii pe care îi urmărești' : 'Idei și momente din comunitate'}</p>
                  </div>
                  <button type="button" class="icon-button" onClick={loadPosts} aria-label="Reîncarcă feedul" title="Reîncarcă">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                </div>

                <div class="feed-tabs" role="tablist" aria-label="Alege feedul">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={feedMode() === 'discover'}
                    class={feedMode() === 'discover' ? 'is-active' : ''}
                    onClick={() => selectFeed('discover')}
                  >
                    Pentru tine
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={feedMode() === 'following'}
                    class={feedMode() === 'following' ? 'is-active' : ''}
                    onClick={() => selectFeed('following')}
                  >
                    Urmărești
                  </button>
                </div>

                <CreatePost onPostCreated={handlePostCreated} />

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
                      <h2>{feedMode() === 'following' ? 'Feedul urmărit este gol' : 'Începe conversația'}</h2>
                      <p>
                        {feedMode() === 'following'
                          ? 'Urmărește câțiva oameni din comunitate, iar postările lor vor apărea aici.'
                          : 'Feedul este liber. Publică primul gând și dă tonul comunității.'}
                      </p>
                      <Show when={feedMode() === 'following'}>
                        <A href="/search" class="btn btn-primary" style={{ 'margin-top': '20px' }}>Descoperă oameni</A>
                      </Show>
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
