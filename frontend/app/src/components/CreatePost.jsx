import { createSignal, onMount, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { readPostDraft, removePostDraft, storePostDraft } from '../utils/postDraft';
import { getImageUrl } from '../utils/urls';

const MAX_CONTENT_LENGTH = 500;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function CreatePost(props) {
  const auth = useAuth();
  const [content, setContent] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const [imageFile, setImageFile] = createSignal(null);
  const [imagePreview, setImagePreview] = createSignal(null);
  const [error, setError] = createSignal('');
  const [recoverableDraft, setRecoverableDraft] = createSignal(null);
  const [draftStatus, setDraftStatus] = createSignal('');
  let fileInput;
  let contentInput;

  const draftSavedTime = () => {
    const savedAt = recoverableDraft()?.savedAt;
    if (!savedAt) return '';
    return new Date(savedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  };

  const focusComposer = () => {
    window.requestAnimationFrame(() => contentInput?.focus({ preventScroll: true }));
  };

  const handleContentInput = (event) => {
    const nextContent = event.currentTarget.value;
    setContent(nextContent);

    if (!nextContent.trim()) {
      removePostDraft(auth.user()?.id);
      setDraftStatus('');
    } else if (nextContent.length > MAX_CONTENT_LENGTH) {
      removePostDraft(auth.user()?.id);
      setDraftStatus('too-long');
    } else {
      setDraftStatus(storePostDraft(auth.user()?.id, nextContent) ? 'saved' : 'unavailable');
    }
  };

  const restoreDraft = () => {
    const draft = recoverableDraft();
    if (!draft) return;
    setContent(draft.content);
    setRecoverableDraft(null);
    setDraftStatus('saved');
    focusComposer();
  };

  const discardDraft = () => {
    removePostDraft(auth.user()?.id);
    setRecoverableDraft(null);
    setDraftStatus('');
    focusComposer();
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInput) fileInput.value = '';
  };

  const handleImageChange = (event) => {
    const file = event.currentTarget.files?.[0];
    setError('');
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      clearImage();
      setError('Alege o imagine JPG, PNG sau WebP.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      clearImage();
      setError('Imaginea depășește limita de 10 MB.');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.onerror = () => {
      clearImage();
      setError('Imaginea nu a putut fi citită.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const postContent = content().trim();
    if (!postContent || postContent.length > MAX_CONTENT_LENGTH || submitting()) return;

    setSubmitting(true);
    setError('');
    try {
      let imageUrl = null;
      if (imageFile()) {
        const result = await api.uploadPostImage(imageFile());
        imageUrl = result.image_url;
      }

      await api.createPost(postContent, imageUrl);
      removePostDraft(auth.user()?.id);
      setContent('');
      setDraftStatus('');
      clearImage();
      await props.onPostCreated?.();
    } catch (requestError) {
      console.error('Failed to create post:', requestError);
      setError('Postarea nu a putut fi publicată. Încearcă din nou.');
    } finally {
      setSubmitting(false);
    }
  };

  onMount(() => {
    setRecoverableDraft(readPostDraft(auth.user()?.id));
  });

  return (
    <section class="surface composer" aria-label="Creează o postare">
      <Show when={recoverableDraft()}>
        <aside class="composer-draft-recovery" aria-labelledby="composer-draft-title">
          <span class="composer-draft-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 4h12v16H6V4Zm3 4h6m-6 4h6m-6 4h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <div class="composer-draft-copy" role="status">
            <strong id="composer-draft-title">Am găsit o schiță nestrimisă</strong>
            <small>Salvată temporar la {draftSavedTime()}. Doar textul a fost păstrat în această filă.</small>
          </div>
          <div class="composer-draft-actions">
            <button type="button" class="btn btn-secondary" onClick={discardDraft}>Șterge</button>
            <button type="button" class="btn btn-primary" onClick={restoreDraft}>Restaurează</button>
          </div>
        </aside>
      </Show>

      <form onSubmit={handleSubmit}>
        <div class="composer-head">
          <Show
            when={auth.user()?.avatar_url}
            fallback={<span class="avatar-fallback">{auth.user()?.username?.charAt(0).toUpperCase()}</span>}
          >
            <img class="avatar" src={getImageUrl(auth.user()?.avatar_url)} alt="" />
          </Show>

          <div class="composer-body">
            <label class="sr-only" for="new-post-content">Conținutul postării</label>
            <textarea
              ref={contentInput}
              id="new-post-content"
              class="composer-textarea"
              value={content()}
              onInput={handleContentInput}
              disabled={Boolean(recoverableDraft())}
              placeholder={`Ce vrei să împărtășești, ${auth.user()?.username || 'azi'}?`}
              aria-describedby="new-post-count new-post-draft-status new-post-error"
            />

            <Show when={imagePreview()}>
              <div class="composer-preview">
                <img src={imagePreview()} alt="Previzualizarea imaginii selectate" />
                <button type="button" class="media-remove" onClick={clearImage} aria-label="Elimină imaginea">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
            </Show>
          </div>
        </div>

        <div class="composer-footer">
          <div class="composer-tools">
            <input
              ref={fileInput}
              class="sr-only"
              type="file"
              id="post-image"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={handleImageChange}
              disabled={Boolean(recoverableDraft())}
            />
            <label class={`media-picker ${recoverableDraft() ? 'is-disabled' : ''}`} for="post-image" aria-disabled={Boolean(recoverableDraft())}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8" />
                <circle cx="8.5" cy="9" r="1.5" stroke="currentColor" stroke-width="1.6" />
                <path d="m4 17 4.5-4 3.2 3 2.8-2.5L20 18" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
              </svg>
              <span>{imageFile() ? 'Schimbă imaginea' : 'Adaugă imagine'}</span>
            </label>
            <span id="new-post-count" class={`character-count ${content().length > MAX_CONTENT_LENGTH ? 'is-over' : ''}`}>
              {content().length}/{MAX_CONTENT_LENGTH}
            </span>
          </div>

          <button
            type="submit"
            class="btn btn-primary"
            disabled={Boolean(recoverableDraft()) || submitting() || !content().trim() || content().length > MAX_CONTENT_LENGTH}
          >
            <Show when={submitting()} fallback="Publică">
              <svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".25" stroke-width="3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
              </svg>
              Se publică…
            </Show>
          </button>
        </div>

        <Show when={error()}>
          <p id="new-post-error" class="composer-message" role="alert">{error()}</p>
        </Show>
        <Show when={draftStatus()}>
          <p id="new-post-draft-status" class={`composer-draft-status is-${draftStatus()}`} role="status">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <Show
                when={draftStatus() === 'saved'}
                fallback={<path d="M12 8v5m0 3.5v.01M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.6L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />}
              >
                <path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
              </Show>
            </svg>
            <span>
              {draftStatus() === 'saved'
                ? (imageFile() ? 'Text salvat temporar; imaginea nu este inclusă în schiță.' : 'Schiță salvată temporar în această filă.')
                : (draftStatus() === 'too-long' ? 'Schița se salvează din nou când textul revine la maximum 500 de caractere.' : 'Salvarea temporară nu este disponibilă în acest browser.')}
            </span>
          </p>
        </Show>
      </form>
    </section>
  );
}
