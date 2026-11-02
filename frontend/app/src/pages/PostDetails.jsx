import { A, useNavigate, useParams } from '@solidjs/router';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import PostCard from '../components/PostCard';
import { getImageUrl, loginPath, postPath } from '../utils/urls';

function postDescription(content, maximumCharacters = 180) {
  const condensed = String(content || '').trim().replace(/\s+/g, ' ');
  if ([...condensed].length <= maximumCharacters) return condensed;
  return `${[...condensed].slice(0, maximumCharacters - 1).join('').trimEnd()}…`;
}

export default function PostDetails() {
  const params = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [post, setPost] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');
  const [loadedPostId, setLoadedPostId] = createSignal(null);
  const [shareStatus, setShareStatus] = createSignal('');
  let shareStatusTimer;

  const loadPost = async (postId = params.id) => {
    setLoading(true);
    setError('');
    try {
      setPost(await api.getPost(postId));
    } catch (requestError) {
      console.error('Failed to load post:', requestError);
      setPost(null);
      setError(requestError.status === 404
        ? 'Postarea nu există sau nu este disponibilă pentru contul tău.'
        : 'Postarea nu a putut fi încărcată. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  const showShareStatus = (message) => {
    window.clearTimeout(shareStatusTimer);
    setShareStatus(message);
    shareStatusTimer = window.setTimeout(() => setShareStatus(''), 3500);
  };

  const sharePost = async () => {
    const current = post();
    if (!current) return;
    const url = `${window.location.origin}${postPath(current.id)}`;
    const shareData = {
      title: `Postare de ${current.user.username} — Media`,
      text: postDescription(current.content, 140),
      url,
    };

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        showShareStatus('Postarea a fost distribuită.');
        return;
      } catch (shareError) {
        if (shareError?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      showShareStatus('Link copiat.');
    } catch {
      showShareStatus('Linkul nu a putut fi copiat automat.');
    }
  };

  createEffect(() => {
    const postId = params.id;
    if (postId && loadedPostId() !== postId) {
      setLoadedPostId(postId);
      void loadPost(postId);
    }
  });

  onCleanup(() => window.clearTimeout(shareStatusTimer));

  return (
    <>
      <PageMeta
        title={post() ? `Postare de ${post().user.username} — Media` : 'Postare — Media'}
        description={post() ? postDescription(post().content) : 'Postare distribuită pe Media.'}
        canonicalPath={postPath(params.id)}
        imageUrl={post()?.image_url ? getImageUrl(post().image_url) : null}
        openGraphType="article"
        noIndex
      />
      <Navbar />
      <main class="post-detail-page app-container">
        <div class="post-detail-toolbar">
          <A href="/" class="text-link post-detail-back">
            <span aria-hidden="true">←</span> Înapoi la flux
          </A>
          <Show when={post()}>
            <button type="button" class="btn btn-secondary" onClick={sharePost}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="1.8" /><circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="1.8" /><circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="1.8" /><path d="m8.7 10.7 6.6-4.2m-6.6 6.8 6.6 4.2" stroke="currentColor" stroke-width="1.8" /></svg>
              Distribuie
            </button>
          </Show>
        </div>

        <Show when={shareStatus()}><p class="post-share-status" role="status">{shareStatus()}</p></Show>

        <Show
          when={!loading()}
          fallback={<div class="surface post-detail-skeleton" aria-busy="true"><div class="skeleton-lines"><div class="skeleton-line" /><div class="skeleton-line" /><div class="skeleton-line" /></div></div>}
        >
          <Show
            when={post()}
            fallback={
              <section class="surface state-card post-detail-state" role="alert">
                <div>
                  <span class="state-icon" aria-hidden="true">!</span>
                  <h1>Postare indisponibilă</h1>
                  <p>{error()}</p>
                  <div class="post-detail-state-actions">
                    <button type="button" class="btn btn-primary" onClick={() => loadPost()}>Încearcă din nou</button>
                    <A href="/" class="btn btn-secondary">Vezi fluxul</A>
                  </div>
                </div>
              </section>
            }
          >
            <section aria-labelledby="post-detail-title">
              <div class="post-detail-heading">
                <p class="eyebrow">Postare distribuită</p>
                <h1 id="post-detail-title">Conversația completă</h1>
              </div>
              <PostCard
                post={post()}
                onUpdate={() => loadPost()}
                onDelete={() => navigate('/', { replace: true })}
                onHiddenChange={() => navigate('/', { replace: true })}
              />
            </section>
          </Show>
        </Show>

        <aside class="surface post-detail-privacy-note">
          <div>
            <strong>Vizibilitatea rămâne sub controlul autorului.</strong>
            <p>Linkul funcționează numai cât timp ai acces la postare. Conturile private, blocările și ștergerea sunt verificate la fiecare deschidere.</p>
          </div>
          <Show when={!auth.loading() && !auth.isAuthenticated()}>
            <A href={loginPath(postPath(params.id))} class="text-link">Conectare</A>
          </Show>
        </aside>
      </main>
    </>
  );
}
