import { A, useNavigate, useSearchParams } from '@solidjs/router';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import PostCard from '../components/PostCard';
import { getImageUrl } from '../utils/urls';

const MAX_SEARCH_LENGTH = 64;

export default function Search() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal({ users: [], posts: [] });
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  const [loadedQuery, setLoadedQuery] = createSignal('');

  const performSearch = async (searchTerm) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.search(searchTerm);
      setResults({ users: data.users || [], posts: data.posts || [] });
    } catch (requestError) {
      console.error('Search failed:', requestError);
      setError('Căutarea nu a putut fi finalizată. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const searchTerm = query().trim();
    if (searchTerm.length < 2 || searchTerm.length > MAX_SEARCH_LENGTH || loading()) return;

    setLoadedQuery(searchTerm);
    setSearchParams({ q: searchTerm });
    await performSearch(searchTerm);
  };

  createEffect(() => {
    if (auth.loading()) return;
    if (!auth.isAuthenticated()) {
      navigate('/login');
      return;
    }

    const initialQuery = (searchParams.q || '').trim().slice(0, MAX_SEARCH_LENGTH);
    if (initialQuery.length >= 2 && loadedQuery() !== initialQuery) {
      setQuery(initialQuery);
      setLoadedQuery(initialQuery);
      void performSearch(initialQuery);
    }
  });

  const totalResults = () => results().users.length + results().posts.length;

  return (
    <>
      <PageMeta
        title={loadedQuery() ? `Caută „${loadedQuery()}” — Media` : 'Caută — Media'}
        description="Caută utilizatori și postări în comunitatea Media."
        canonicalPath="/search"
        noIndex
      />
      <Navbar />
      <main class="search-page app-container">
        <section class="search-hero" aria-labelledby="search-title">
          <p class="sidebar-eyebrow">Descoperă comunitatea</p>
          <h1 id="search-title">Caută oameni și idei</h1>
          <p>Introdu cel puțin două caractere. Rezultatele includ profiluri și conținutul postărilor.</p>

          <form class="search-form" role="search" onSubmit={handleSubmit}>
            <label class="sr-only" for="global-search">Caută utilizatori și postări</label>
            <span class="search-field-icon" aria-hidden="true">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" /><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
            </span>
            <input
              id="global-search"
              class="input"
              type="search"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              minlength="2"
              maxlength={MAX_SEARCH_LENGTH}
              autocomplete="off"
              placeholder="Nume sau cuvinte dintr-o postare"
              autofocus
            />
            <button type="submit" class="btn btn-primary" disabled={loading() || query().trim().length < 2}>
              {loading() ? 'Se caută…' : 'Caută'}
            </button>
          </form>
        </section>

        <Show when={error()}>
          <div class="surface search-state" role="alert">
            <h2>Căutare indisponibilă</h2>
            <p>{error()}</p>
          </div>
        </Show>

        <Show when={!loading() && !error() && loadedQuery()}>
          <div class="search-summary" aria-live="polite">
            <strong>{totalResults()}</strong> {totalResults() === 1 ? 'rezultat' : 'rezultate'} pentru „{loadedQuery()}”
          </div>

          <Show
            when={totalResults() > 0}
            fallback={
              <div class="surface search-state">
                <h2>Niciun rezultat</h2>
                <p>Încearcă un nume mai scurt sau alte cuvinte-cheie.</p>
              </div>
            }
          >
            <Show when={results().users.length > 0}>
              <section class="search-section" aria-labelledby="people-results-title">
                <div class="section-heading">
                  <h2 id="people-results-title">Oameni</h2>
                  <span>{results().users.length}</span>
                </div>
                <div class="people-results">
                  <For each={results().users}>
                    {(user) => (
                      <A href={`/profile/${user.id}`} class="surface person-result">
                        <Show
                          when={user.avatar_url}
                          fallback={<span class="search-avatar avatar-fallback">{user.username.charAt(0).toUpperCase()}</span>}
                        >
                          <img class="search-avatar avatar" src={getImageUrl(user.avatar_url)} alt="" loading="lazy" decoding="async" />
                        </Show>
                        <span class="person-result-copy">
                          <strong>{user.username}</strong>
                          <span>{user.bio || 'Membru al comunității Media'}</span>
                          <small>{user.posts_count} {Number(user.posts_count) === 1 ? 'postare' : 'postări'}</small>
                        </span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                      </A>
                    )}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={results().posts.length > 0}>
              <section class="search-section search-posts" aria-labelledby="post-results-title">
                <div class="section-heading">
                  <h2 id="post-results-title">Postări</h2>
                  <span>{results().posts.length}</span>
                </div>
                <div class="feed-list">
                  <For each={results().posts}>
                    {(post) => <PostCard post={post} onDelete={() => performSearch(loadedQuery())} onUpdate={() => performSearch(loadedQuery())} />}
                  </For>
                </div>
              </section>
            </Show>
          </Show>
        </Show>
      </main>
    </>
  );
}
