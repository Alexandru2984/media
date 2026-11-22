import { A, useNavigate, useParams } from '@solidjs/router';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import PostCard from '../components/PostCard';
import ShareLink from '../components/ShareLink';
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
  const [loadedViewer, setLoadedViewer] = createSignal(undefined);
  let requestVersion = 0;

  const loadPost = async (postId = params.id) => {
    const version = ++requestVersion;
    const viewer = auth.user()?.id || null;
    const isCurrent = () => version === requestVersion && params.id === postId && (auth.user()?.id || null) === viewer;
    setLoading(true);
    setError('');
    try {
      const data = await api.getPost(postId);
      if (isCurrent()) setPost(data);
    } catch (requestError) {
      if (!isCurrent()) return;
      console.error('Failed to load post:', requestError);
      setPost(null);
      setError(requestError.status === 404
        ? 'Postarea nu există sau nu este disponibilă pentru contul tău.'
        : 'Postarea nu a putut fi încărcată. Încearcă din nou.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  createEffect(() => {
    const postId = params.id;
    if (auth.loading()) return;
    const viewer = auth.user()?.id || null;
    if (postId && (loadedPostId() !== postId || loadedViewer() !== viewer)) {
      setLoadedPostId(postId);
      setLoadedViewer(viewer);
      setPost(null);
      void loadPost(postId);
    }
  });

  onCleanup(() => { requestVersion += 1; });

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
            <ShareLink path={postPath(post().id)} title={`Postare de ${post().user.username} — Media`} />
          </Show>
        </div>

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
