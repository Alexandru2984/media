import { A, useNavigate } from '@solidjs/router';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import { getImageUrl } from '../utils/urls';

const PAGE_SIZE = 20;

export default function FollowRequests() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = createSignal([]);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [pendingAction, setPendingAction] = createSignal('');
  const [error, setError] = createSignal('');
  const [loaded, setLoaded] = createSignal(false);

  const loadRequests = async ({ append = false } = {}) => {
    if (append && (loadingMore() || !hasMore())) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const data = await api.getFollowRequests(PAGE_SIZE, append ? requests().length : 0);
      setRequests((current) => append ? [...current, ...data] : data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (requestError) {
      console.error('Failed to load follow requests:', requestError);
      setError('Cererile de urmărire nu au putut fi încărcate.');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const decideRequest = async (request, accept) => {
    if (pendingAction()) return;
    setPendingAction(`${accept ? 'accept' : 'reject'}:${request.id}`);
    setError('');
    try {
      if (accept) await api.acceptFollowRequest(request.id);
      else await api.rejectFollowRequest(request.id);
      setRequests((current) => current.filter((item) => item.id !== request.id));
    } catch (requestError) {
      console.error('Failed to decide follow request:', requestError);
      if (requestError.status === 404) {
        setRequests((current) => current.filter((item) => item.id !== request.id));
      } else {
        setError('Cererea nu a putut fi actualizată. Reîncarcă lista și încearcă din nou.');
      }
    } finally {
      setPendingAction('');
    }
  };

  createEffect(() => {
    if (auth.loading()) return;
    if (!auth.isAuthenticated()) {
      navigate('/login');
      return;
    }
    if (!loaded()) {
      setLoaded(true);
      void loadRequests();
    }
  });

  return (
    <>
      <PageMeta
        title="Cereri de urmărire — Media"
        description="Administrează cererile de urmărire ale contului tău Media."
        canonicalPath="/cereri"
        noIndex
      />
      <Navbar />
      <main class="connections-page app-container">
        <header class="connections-header">
          <A href={`/profile/${auth.user()?.id}`} class="icon-button" aria-label="Înapoi la profil" title="Înapoi la profil">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </A>
          <div>
            <p class="sidebar-eyebrow">Confidențialitate</p>
            <h1>Cereri de urmărire</h1>
            <p>Acceptă numai persoanele cărora vrei să le oferi acces la postările tale private.</p>
          </div>
        </header>

        <Show when={error()}><p class="alert alert-error connections-alert" role="alert">{error()}</p></Show>

        <Show
          when={!loading()}
          fallback={<div class="surface skeleton"><div class="skeleton-lines"><div class="skeleton-line" /><div class="skeleton-line" /><div class="skeleton-line" /></div></div>}
        >
          <Show
            when={requests().length > 0}
            fallback={
              <Show when={!error()}>
                <div class="surface state-card"><div><span class="state-icon"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21a9 9 0 1 0-9-9m5 0 2.5 2.5L16 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span><h2>Ești la zi</h2><p>Nu există cereri de urmărire în așteptare.</p></div></div>
              </Show>
            }
          >
            <div class="connections-list">
              <For each={requests()}>
                {(request) => (
                  <article class="surface connection-card request-card">
                    <A href={`/profile/${request.id}`} class="connection-person">
                      <Show
                        when={request.avatar_url}
                        fallback={<span class="connection-avatar avatar-fallback">{request.username.charAt(0).toUpperCase()}</span>}
                      >
                        <img class="connection-avatar avatar" src={getImageUrl(request.avatar_url)} alt="" loading="lazy" decoding="async" />
                      </Show>
                      <span class="connection-copy">
                        <strong>{request.username}</strong>
                        <span>{request.bio || 'Membru al comunității Media'}</span>
                        <small>{request.posts_count} {Number(request.posts_count) === 1 ? 'postare' : 'postări'}{request.is_private ? ' · cont privat' : ''}</small>
                      </span>
                    </A>
                    <div class="request-actions">
                      <button type="button" class="btn btn-primary" onClick={() => decideRequest(request, true)} disabled={Boolean(pendingAction())}>
                        {pendingAction() === `accept:${request.id}` ? 'Se acceptă…' : 'Acceptă'}
                      </button>
                      <button type="button" class="btn btn-danger-ghost" onClick={() => decideRequest(request, false)} disabled={Boolean(pendingAction())}>
                        {pendingAction() === `reject:${request.id}` ? 'Se șterge…' : 'Șterge'}
                      </button>
                    </div>
                  </article>
                )}
              </For>
            </div>
            <Show when={hasMore()}>
              <div class="feed-pagination"><button type="button" class="btn btn-secondary" onClick={() => loadRequests({ append: true })} disabled={loadingMore()}>{loadingMore() ? 'Se încarcă…' : 'Încarcă mai multe'}</button></div>
            </Show>
          </Show>
        </Show>
      </main>
    </>
  );
}
