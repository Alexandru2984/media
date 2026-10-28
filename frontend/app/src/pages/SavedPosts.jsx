import { useNavigate } from '@solidjs/router';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import PostCard from '../components/PostCard';

const PAGE_SIZE = 10;

function SavedPostsSkeleton() {
  return (
    <div class="loading-stack" aria-label="Se încarcă postările salvate" aria-busy="true">
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

export default function SavedPosts() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = createSignal([]);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [error, setError] = createSignal('');
  const [loadedForUser, setLoadedForUser] = createSignal(null);

  const loadSavedPosts = async ({ append = false } = {}) => {
    if (append && (loadingMore() || !hasMore())) return;

    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');

    try {
      const offset = append ? posts().length : 0;
      const data = await api.getSavedPosts(PAGE_SIZE, offset);
      if (append) {
        setPosts((current) => {
          const knownIds = new Set(current.map((post) => post.id));
          return [...current, ...data.filter((post) => !knownIds.has(post.id))];
        });
      } else {
        setPosts(data);
      }
      setHasMore(data.length === PAGE_SIZE);
    } catch (requestError) {
      console.error('Failed to load saved posts:', requestError);
      setError('Postările salvate nu au putut fi încărcate. Încearcă din nou.');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  createEffect(() => {
    if (auth.loading()) return;
    if (!auth.isAuthenticated()) {
      navigate('/login');
      return;
    }

    const userId = auth.user()?.id;
    if (userId && loadedForUser() !== userId) {
      setLoadedForUser(userId);
      void loadSavedPosts();
    }
  });

  const handleSavedChange = (isSaved, postId) => {
    if (!isSaved) setPosts((current) => current.filter((post) => post.id !== postId));
  };

  return (
    <>
      <PageMeta
        title="Postări salvate — Media"
        description="Colecția ta privată de postări salvate pe Media."
        canonicalPath="/salvate"
        noIndex
      />
      <Navbar />
      <main class="saved-page app-container">
        <header class="saved-hero">
          <span class="saved-hero-icon" aria-hidden="true">
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none">
              <path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            </svg>
          </span>
          <div>
            <p class="sidebar-eyebrow">Doar pentru tine</p>
            <h1>Postări salvate</h1>
            <p>Păstrează ideile la care vrei să revii. Colecția ta nu este publică.</p>
          </div>
        </header>

        <Show when={!loading()} fallback={<SavedPostsSkeleton />}>
          <Show when={error()}>
            <div class="surface state-card" role="alert">
              <div>
                <h2>Nu am putut deschide colecția</h2>
                <p>{error()}</p>
                <button type="button" class="btn btn-primary" onClick={() => loadSavedPosts()} style={{ 'margin-top': '18px' }}>Încearcă din nou</button>
              </div>
            </div>
          </Show>

          <Show when={!error() && posts().length === 0}>
            <div class="surface state-card">
              <div>
                <span class="state-icon">
                  <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
                </span>
                <h2>Colecția este goală</h2>
                <p>Folosește butonul Salvează de pe orice postare și o vei găsi aici.</p>
              </div>
            </div>
          </Show>

          <Show when={!error() && posts().length > 0}>
            <div class="feed-list">
              <For each={posts()}>
                {(post) => (
                  <PostCard
                    post={post}
                    onSavedChange={handleSavedChange}
                    onDelete={() => loadSavedPosts()}
                    onUpdate={() => loadSavedPosts()}
                  />
                )}
              </For>
            </div>

            <Show when={hasMore()}>
              <div class="feed-pagination">
                <button
                  type="button"
                  class="btn btn-secondary"
                  onClick={() => loadSavedPosts({ append: true })}
                  disabled={loadingMore()}
                >
                  {loadingMore() ? 'Se încarcă…' : 'Încarcă mai multe'}
                </button>
              </div>
            </Show>
          </Show>
        </Show>
      </main>
    </>
  );
}
