import { A, useLocation, useNavigate, useParams } from '@solidjs/router';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import { getImageUrl } from '../utils/urls';

const PAGE_SIZE = 20;

export default function Connections() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [profile, setProfile] = createSignal(null);
  const [users, setUsers] = createSignal([]);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [error, setError] = createSignal('');
  const [loadedKey, setLoadedKey] = createSignal('');
  const [pendingUserId, setPendingUserId] = createSignal(null);

  const isFollowers = () => location.pathname.endsWith('/urmaritori');
  const title = () => isFollowers() ? 'Urmăritori' : 'Urmăriri';

  const loadConnections = async ({ append = false } = {}) => {
    if (append && (loadingMore() || !hasMore())) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');

    try {
      const offset = append ? users().length : 0;
      const connectionsRequest = isFollowers()
        ? api.getFollowers(params.id, PAGE_SIZE, offset)
        : api.getFollowing(params.id, PAGE_SIZE, offset);
      const [profileData, connectionData] = append
        ? [profile(), await connectionsRequest]
        : await Promise.all([api.getProfile(params.id), connectionsRequest]);
      setProfile(profileData);
      if (append) {
        setUsers((current) => {
          const knownIds = new Set(current.map((user) => user.id));
          return [...current, ...connectionData.filter((user) => !knownIds.has(user.id))];
        });
      } else {
        setUsers(connectionData);
      }
      setHasMore(connectionData.length === PAGE_SIZE);
    } catch (requestError) {
      console.error('Failed to load connections:', requestError);
      setError('Lista nu a putut fi încărcată sau nu este disponibilă pentru acest profil.');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const toggleFollow = async (user) => {
    if (pendingUserId() || user.id === auth.user()?.id) return;
    setPendingUserId(user.id);
    setError('');
    try {
      const result = user.is_following
        ? await api.unfollowUser(user.id)
        : await api.followUser(user.id);
      setUsers((current) => current.map((item) => (
        item.id === user.id ? { ...item, is_following: Boolean(result.following) } : item
      )));
    } catch (requestError) {
      console.error('Failed to update connection:', requestError);
      setError('Relația nu a putut fi actualizată. Este posibil ca unul dintre conturi să fie blocat.');
    } finally {
      setPendingUserId(null);
    }
  };

  createEffect(() => {
    if (auth.loading()) return;
    if (!auth.isAuthenticated()) {
      navigate('/login');
      return;
    }
    const key = `${params.id}:${isFollowers() ? 'followers' : 'following'}`;
    if (params.id && loadedKey() !== key) {
      setLoadedKey(key);
      setProfile(null);
      setUsers([]);
      setHasMore(true);
      void loadConnections();
    }
  });

  return (
    <>
      <PageMeta
        title={`${title()}${profile()?.username ? ` — ${profile().username}` : ''} — Media`}
        description={`Lista de ${title().toLocaleLowerCase('ro-RO')} a unui profil Media.`}
        canonicalPath={location.pathname}
        noIndex
      />
      <Navbar />
      <main class="connections-page app-container">
        <header class="connections-header">
          <A href={`/profile/${params.id}`} class="icon-button" aria-label="Înapoi la profil" title="Înapoi la profil">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </A>
          <div>
            <p class="sidebar-eyebrow">{profile()?.username || 'Profil Media'}</p>
            <h1>{title()}</h1>
            <p>{isFollowers() ? 'Oamenii care urmăresc acest profil.' : 'Oamenii urmăriți de acest profil.'}</p>
          </div>
        </header>

        <Show when={error()}>
          <p class="alert alert-error connections-alert" role="alert">{error()}</p>
        </Show>

        <Show
          when={!loading()}
          fallback={<div class="surface skeleton"><div class="skeleton-lines"><div class="skeleton-line" /><div class="skeleton-line" /><div class="skeleton-line" /></div></div>}
        >
          <Show
            when={users().length > 0}
            fallback={
              <Show when={!error()}>
                <div class="surface state-card">
                  <div>
                    <span class="state-icon"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.8" /><circle cx="17" cy="9" r="2.5" stroke="currentColor" stroke-width="1.8" /><path d="M3 20a6 6 0 0 1 12 0m0-5a5 5 0 0 1 6 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></span>
                    <h2>Lista este goală</h2>
                    <p>Conexiunile noi vor apărea aici.</p>
                  </div>
                </div>
              </Show>
            }
          >
            <div class="connections-list">
              <For each={users()}>
                {(user) => (
                  <article class="surface connection-card">
                    <A href={`/profile/${user.id}`} class="connection-person">
                      <Show
                        when={user.avatar_url}
                        fallback={<span class="connection-avatar avatar-fallback">{user.username.charAt(0).toUpperCase()}</span>}
                      >
                        <img class="connection-avatar avatar" src={getImageUrl(user.avatar_url)} alt="" loading="lazy" decoding="async" />
                      </Show>
                      <span class="connection-copy">
                        <strong>{user.username}</strong>
                        <span>{user.bio || 'Membru al comunității Media'}</span>
                        <small>{user.posts_count} {Number(user.posts_count) === 1 ? 'postare' : 'postări'}</small>
                      </span>
                    </A>
                    <Show when={user.id !== auth.user()?.id}>
                      <button
                        type="button"
                        class={`btn ${user.is_following ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => toggleFollow(user)}
                        disabled={pendingUserId() === user.id}
                      >
                        {pendingUserId() === user.id ? 'Se actualizează…' : (user.is_following ? 'Urmărești' : 'Urmărește')}
                      </button>
                    </Show>
                  </article>
                )}
              </For>
            </div>

            <Show when={hasMore()}>
              <div class="feed-pagination">
                <button type="button" class="btn btn-secondary" onClick={() => loadConnections({ append: true })} disabled={loadingMore()}>
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
