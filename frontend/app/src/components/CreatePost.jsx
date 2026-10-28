import { createSignal, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
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
  let fileInput;

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
      setContent('');
      clearImage();
      await props.onPostCreated?.();
    } catch (requestError) {
      console.error('Failed to create post:', requestError);
      setError('Postarea nu a putut fi publicată. Încearcă din nou.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section class="surface composer" aria-label="Creează o postare">
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
              id="new-post-content"
              class="composer-textarea"
              value={content()}
              onInput={(event) => setContent(event.currentTarget.value)}
              placeholder={`Ce vrei să împărtășești, ${auth.user()?.username || 'azi'}?`}
              aria-describedby="new-post-count new-post-error"
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
            />
            <label class="media-picker" for="post-image">
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
            disabled={submitting() || !content().trim() || content().length > MAX_CONTENT_LENGTH}
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
      </form>
    </section>
  );
}
