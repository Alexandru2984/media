import { useNavigate } from '@solidjs/router';
import { createEffect, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import PostCard from '../components/PostCard';
import Modal from '../components/Modal';
import { savedCollectionApi } from '../utils/savedCollectionApi';
import { COLLECTION_LIMIT, COLLECTION_NAME_LIMIT, collectionNameIsValid, collectionNameLength } from '../utils/savedCollections';
import './SavedPosts.css';

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
  const [collections, setCollections] = createSignal([]);
  const [selected, setSelected] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [libraryLoading, setLibraryLoading] = createSignal(true);
  const [hasMore, setHasMore] = createSignal(false);
  const [nextOffset, setNextOffset] = createSignal(0);
  const [error, setError] = createSignal('');
  const [libraryError, setLibraryError] = createSignal('');
  const [actionError, setActionError] = createSignal('');
  const [status, setStatus] = createSignal('');
  const [loadedForUser, setLoadedForUser] = createSignal(null);
  const [dialog, setDialog] = createSignal(null);
  const [name, setName] = createSignal('');
  const [dialogError, setDialogError] = createSignal('');
  const [pending, setPending] = createSignal(false);
  let alive = true, requestVersion = 0, libraryVersion = 0, mutationVersion = 0;
  onCleanup(() => { alive = false; requestVersion++; libraryVersion++; mutationVersion++; });
  const currentViewer = (viewer) => alive && !auth.loading() && auth.user()?.id === viewer && loadedForUser() === viewer;
  const currentCollection = () => collections().find((item) => item.id === selected());
  const controlsBusy = () => pending() || refreshing() || libraryLoading() || Boolean(libraryError());

  const loadCollections = async () => {
    const viewer = auth.user()?.id;
    const version = ++libraryVersion;
    const current = () => currentViewer(viewer) && version === libraryVersion;
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const data = await savedCollectionApi.list();
      if (current()) {
        setCollections(data);
        if (selected() && selected() !== 'unfiled' && !data.some((item) => item.id === selected())) {
          setSelected('');
          void loadSavedPosts();
        }
      }
    } catch {
      if (current()) {
        setCollections([]);
        setLibraryError('Colecțiile nu au putut fi încărcate.');
      }
    } finally {
      if (current()) setLibraryLoading(false);
    }
  };

  const loadSavedPosts = async ({ append = false, soft = false } = {}) => {
    if (append && (loadingMore() || refreshing() || pending() || !hasMore())) return;
    const viewer = auth.user()?.id;
    const filter = selected();
    const version = ++requestVersion;
    const current = () => currentViewer(viewer) && version === requestVersion && selected() === filter;
    const offset = append ? nextOffset() : 0;
    const limit = soft ? Math.min(50, Math.max(PAGE_SIZE, posts().length)) : PAGE_SIZE;
    setLoading(!append && !soft);
    setLoadingMore(append);
    setRefreshing(soft);
    setError('');
    try {
      const data = await api.getSavedPosts(limit, offset, filter);
      if (!current()) return;
      if (append) {
        setPosts((previous) => {
          const known = new Set(previous.map((post) => post.id));
          return [...previous, ...data.filter((post) => !known.has(post.id))];
        });
      } else setPosts(data);
      // Advance by rows consumed, not by deduplicated rendered rows.
      setNextOffset(offset + data.length);
      setHasMore(data.length === limit && offset + data.length <= 10_000);
    } catch (requestError) {
      if (!current()) return;
      if (!append) { setPosts([]); setNextOffset(0); setHasMore(false); }
      setError(requestError.status === 404
        ? 'Colecția nu mai este disponibilă. Poți reveni la toate salvările.'
        : 'Postările salvate nu au putut fi încărcate. Încearcă din nou.');
    } finally {
      if (current()) { setLoading(false); setLoadingMore(false); setRefreshing(false); }
    }
  };

  const changeFilter = (value) => {
    setSelected(value);
    setStatus('');
    setActionError('');
    void loadSavedPosts();
  };

  createEffect(on(() => [auth.loading(), auth.user()?.id], ([authLoading, viewer]) => {
    requestVersion++; libraryVersion++; mutationVersion++;
    if (authLoading) return;
    setLoadedForUser(viewer || null);
    setPosts([]); setCollections([]); setSelected(''); setNextOffset(0);
    setDialog(null); setPending(false); setActionError(''); setStatus('');
    if (!viewer) { navigate('/login'); return; }
    void loadCollections();
    void loadSavedPosts();
  }));

  const openDialog = (kind) => {
    if (controlsBusy()) return;
    const collection = currentCollection();
    if (kind !== 'create' && !collection) return;
    setName(kind === 'create' ? '' : collection.name);
    setDialogError('');
    setDialog({ kind, id: collection?.id, name: collection?.name });
  };

  const submitCollection = async (event) => {
    event.preventDefault();
    const choice = dialog();
    if (!choice || pending() || (choice.kind !== 'delete' && !collectionNameIsValid(name()))) return;
    const viewer = auth.user()?.id;
    const version = ++mutationVersion;
    const current = () => currentViewer(viewer) && version === mutationVersion;
    setPending(true); setDialogError(''); setActionError(''); setStatus('');
    try {
      if (choice.kind === 'delete') {
        await savedCollectionApi.delete(choice.id);
        if (!current()) return;
        setCollections((items) => items.filter((item) => item.id !== choice.id));
        setSelected('unfiled');
        setStatus('Colecția a fost ștearsă. Postările au rămas salvate.');
      } else {
        const result = choice.kind === 'create'
          ? await savedCollectionApi.create(name().trim())
          : await savedCollectionApi.rename(choice.id, name().trim());
        if (!current()) return;
        setCollections((items) => choice.kind === 'create' ? [...items, result] : items.map((item) => item.id === result.id ? result : item));
        setSelected(result.id);
        setStatus(choice.kind === 'create' ? 'Colecția a fost creată.' : 'Numele colecției a fost actualizat.');
      }
      await loadSavedPosts({ soft: true });
      if (current()) { setPending(false); setDialog(null); }
    } catch (requestError) {
      if (current()) setDialogError(requestError.status === 409
        ? 'Numele există deja sau ai atins limita de 30 de colecții.'
        : 'Modificarea nu a putut fi salvată. Încearcă din nou.');
    } finally {
      if (current()) setPending(false);
    }
  };

  const movePost = async (post, target) => {
    if (controlsBusy() || loadingMore() || target === (post.collection_id || '')) return;
    const viewer = auth.user()?.id;
    const version = ++mutationVersion;
    const current = () => currentViewer(viewer) && version === mutationVersion;
    setPending(true); setActionError(''); setStatus('');
    try {
      const result = await savedCollectionApi.assign(post.id, target);
      if (!current()) return;
      setPosts((items) => items.map((item) => item.id === post.id ? { ...item, collection_id: result.collection_id } : item));
      await loadSavedPosts({ soft: true });
      if (current()) {
        setStatus('Postarea a fost mutată.');
        setPending(false);
        (document.getElementById(`collection-for-${post.id}`) || document.getElementById('saved-collection-filter'))?.focus({ preventScroll: true });
      }
    } catch {
      if (current()) setActionError('Postarea nu a putut fi mutată. Încearcă din nou.');
    } finally {
      if (current()) setPending(false);
    }
  };

  const handleSavedChange = (isSaved, postId, viewer) => {
    if (!isSaved && currentViewer(viewer)) {
      setPosts((items) => items.filter((post) => post.id !== postId));
      void loadSavedPosts({ soft: true });
    }
  };
  const dialogTitle = () => ({ create: 'Colecție nouă', rename: 'Redenumește colecția', delete: 'Șterge colecția' })[dialog()?.kind] || 'Colecție';

  return <>
    <PageMeta title="Postări salvate — Media" description="Organizează postările salvate în colecții private pe Media." canonicalPath="/salvate" noIndex />
    <Navbar />
    <main class="saved-page app-container">
      <header class="saved-hero">
        <span class="saved-hero-icon" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg></span>
        <div><p class="sidebar-eyebrow">Doar pentru tine</p><h1>Postări salvate</h1><p>Lecturi, proiecte, idei. Organizează-le în colecții pe care le vezi doar tu.</p></div>
      </header>
      <Show when={!auth.loading() && auth.user()?.id === loadedForUser()} fallback={<SavedPostsSkeleton />}>
        <section class="surface saved-library" aria-label="Organizează salvările" aria-busy={libraryLoading() || pending() || refreshing()}>
          <div class="saved-library-toolbar">
            <div class="saved-library-filter">
              <label class="field-label" for="saved-collection-filter">Deschide o colecție</label>
              <select id="saved-collection-filter" class="input" value={selected()} disabled={pending()} onChange={(event) => changeFilter(event.currentTarget.value)}>
                <option value="" selected={selected() === ''}>Toate salvările</option><option value="unfiled" selected={selected() === 'unfiled'}>Fără colecție</option>
                <For each={collections()}>{(collection) => <option value={collection.id} selected={selected() === collection.id}>{collection.name}</option>}</For>
              </select>
            </div>
            <button type="button" class="btn btn-primary" disabled={controlsBusy() || collections().length >= COLLECTION_LIMIT} onClick={() => openDialog('create')}>Colecție nouă</button>
          </div>
          <div class="saved-library-actions">
            <p>{collections().length}/{COLLECTION_LIMIT} colecții · câte o colecție pentru fiecare postare</p>
            <Show when={currentCollection()}>
              <button type="button" class="btn btn-secondary" disabled={controlsBusy()} onClick={() => openDialog('rename')}>Redenumește</button>
              <button type="button" class="btn btn-ghost" disabled={controlsBusy()} onClick={() => openDialog('delete')}>Șterge colecția</button>
            </Show>
            <button type="button" class="btn btn-ghost" disabled={pending() || libraryLoading()} onClick={loadCollections}>Actualizează colecțiile</button>
          </div>
          <Show when={libraryError()}><p class="alert alert-error" role="alert">{libraryError()}</p></Show>
          <Show when={actionError()}><p class="alert alert-error" role="alert">{actionError()}</p></Show>
          <p class="saved-library-status" role="status">{pending() ? 'Se salvează…' : refreshing() ? 'Se actualizează lista…' : status()}</p>
        </section>
        <Show when={!loading()} fallback={<SavedPostsSkeleton />}>
          <Show when={error()}><div class="surface state-card" role="alert"><div><h2>Lista nu a putut fi încărcată</h2><p>{error()}</p><div class="saved-library-actions"><button type="button" class="btn btn-secondary" onClick={() => loadSavedPosts({ append: posts().length > 0 })}>Încearcă din nou</button><button type="button" class="btn btn-ghost" onClick={() => changeFilter('')}>Toate salvările</button></div></div></div></Show>
          <Show when={!error() && posts().length === 0}>
            <div class="surface state-card"><div><h2>{selected() ? 'Nicio postare în această colecție' : 'Nicio postare salvată încă'}</h2><p>{selected() ? 'Deschide toate salvările și alege colecția dorită sub fiecare postare.' : 'Folosește butonul Salvează de pe o postare și o vei găsi aici.'}</p></div></div>
          </Show>
          <Show when={posts().length > 0}>
            <div class="feed-list">
              <For each={posts()}>{(post) => {
                const viewer = loadedForUser();
                return <div class="saved-entry">
                  <PostCard post={post} onSavedChange={(saved, id) => handleSavedChange(saved, id, viewer)} onDelete={() => currentViewer(viewer) && loadSavedPosts({ soft: true })} onUpdate={() => currentViewer(viewer) && loadSavedPosts({ soft: true })} />
                  <div class="saved-filing"><label for={`collection-for-${post.id}`}>Colecție</label>
                    <select id={`collection-for-${post.id}`} class="input" aria-label={`Colecția postării de ${post.user.username}`} value={post.collection_id || ''} disabled={controlsBusy() || loadingMore()} onChange={(event) => { const target = event.currentTarget.value; event.currentTarget.value = post.collection_id || ''; void movePost(post, target); }}>
                      <option value="" selected={!post.collection_id}>Fără colecție</option><For each={collections()}>{(collection) => <option value={collection.id} selected={post.collection_id === collection.id}>{collection.name}</option>}</For>
                    </select>
                  </div>
                </div>;
              }}</For>
            </div>
            <Show when={hasMore() && !error()}><div class="feed-pagination"><button type="button" class="btn btn-secondary" disabled={loadingMore() || pending() || refreshing()} onClick={() => loadSavedPosts({ append: true })}>{loadingMore() ? 'Se încarcă…' : 'Încarcă mai multe'}</button></div></Show>
          </Show>
        </Show>
        <Modal open={Boolean(dialog())} busy={pending()} label={dialogTitle()} onClose={() => { if (!pending()) setDialog(null); }}>
          <form class="saved-collection-form" onSubmit={submitCollection}>
            <h2>{dialogTitle()}</h2>
            <Show when={dialog()?.kind === 'delete'} fallback={<>
              <label class="field-label" for="saved-collection-name">Numele colecției</label>
              <input id="saved-collection-name" class="input" value={name()} disabled={pending()} autofocus aria-describedby="saved-name-help saved-name-count" onInput={(event) => setName(event.currentTarget.value)} />
              <div class="saved-name-help"><p id="saved-name-help">1–{COLLECTION_NAME_LIMIT} caractere. Numele este privat.</p><span id="saved-name-count" aria-live="polite">{collectionNameLength(name().trim())}/{COLLECTION_NAME_LIMIT}</span></div>
            </>}><p>Ștergi colecția „{dialog()?.name}”? Postările rămân salvate, fără colecție.</p></Show>
            <Show when={dialogError()}><p class="alert alert-error" role="alert">{dialogError()}</p></Show>
            <div class="saved-library-actions">
              <button type="button" class="btn btn-secondary" disabled={pending()} onClick={() => setDialog(null)}>Renunță</button>
              <button type="submit" class="btn btn-primary" disabled={pending() || (dialog()?.kind !== 'delete' && !collectionNameIsValid(name()))}>{pending() ? 'Se salvează…' : dialog()?.kind === 'delete' ? 'Șterge colecția' : 'Salvează colecția'}</button>
            </div>
          </form>
        </Modal>
      </Show>
    </main>
  </>;
}
