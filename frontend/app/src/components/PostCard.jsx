import { For, Show, createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { getImageUrl } from '../utils/urls';

const MAX_CONTENT_LENGTH = 500;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const relativeTime = new Intl.RelativeTimeFormat('ro', { numeric: 'auto' });

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'dată necunoscută';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  if (absoluteSeconds < 60) return relativeTime.format(seconds, 'second');
  if (absoluteSeconds < 3600) return relativeTime.format(Math.round(seconds / 60), 'minute');
  if (absoluteSeconds < 86400) return relativeTime.format(Math.round(seconds / 3600), 'hour');
  if (absoluteSeconds < 2_592_000) return relativeTime.format(Math.round(seconds / 86400), 'day');
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fullDate(dateString) {
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ro-RO');
}

export default function PostCard(props) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [liked, setLiked] = createSignal(Boolean(props.post.is_liked));
  const [likesCount, setLikesCount] = createSignal(Number(props.post.likes_count) || 0);
  const [commentsCount, setCommentsCount] = createSignal(Number(props.post.comments_count) || 0);
  const [likePending, setLikePending] = createSignal(false);
  const [saved, setSaved] = createSignal(Boolean(props.post.is_saved));
  const [savePending, setSavePending] = createSignal(false);
  const [showComments, setShowComments] = createSignal(false);
  const [commentsLoading, setCommentsLoading] = createSignal(false);
  const [comments, setComments] = createSignal([]);
  const [commentText, setCommentText] = createSignal('');
  const [commentPending, setCommentPending] = createSignal(false);
  const [editing, setEditing] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [editContent, setEditContent] = createSignal(props.post.content);
  const [editingCommentId, setEditingCommentId] = createSignal(null);
  const [editCommentText, setEditCommentText] = createSignal('');
  const [editImageFile, setEditImageFile] = createSignal(null);
  const [editImagePreview, setEditImagePreview] = createSignal(null);
  const [removeImage, setRemoveImage] = createSignal(false);
  const [error, setError] = createSignal('');
  let editFileInput;

  const isOwn = () => auth.user()?.id === props.post.user.id;
  const openProfile = (userId) => navigate(`/profile/${userId}`);

  const reloadComments = async () => {
    const data = await api.getComments(props.post.id);
    setComments(data);
    setCommentsCount(data.length);
  };

  const handleLike = async () => {
    if (likePending()) return;
    setLikePending(true);
    setError('');
    try {
      const result = await api.likePost(props.post.id);
      const wasLiked = liked();
      const isLiked = Boolean(result.liked);
      setLiked(isLiked);
      const confirmedCount = Number(result.likes_count);
      if (Number.isFinite(confirmedCount)) {
        setLikesCount(Math.max(0, confirmedCount));
      } else if (isLiked !== wasLiked) {
        setLikesCount((count) => Math.max(0, count + (isLiked ? 1 : -1)));
      }
    } catch (requestError) {
      console.error('Failed to like post:', requestError);
      setError('Aprecierea nu a putut fi salvată.');
    } finally {
      setLikePending(false);
    }
  };

  const handleSave = async () => {
    if (savePending()) return;
    setSavePending(true);
    setError('');
    try {
      const result = await api.savePost(props.post.id);
      const isSaved = Boolean(result.saved);
      setSaved(isSaved);
      await props.onSavedChange?.(isSaved, props.post.id);
    } catch (requestError) {
      console.error('Failed to save post:', requestError);
      setError('Postarea nu a putut fi salvată.');
    } finally {
      setSavePending(false);
    }
  };

  const toggleComments = async () => {
    if (showComments()) {
      setShowComments(false);
      return;
    }

    setShowComments(true);
    setCommentsLoading(true);
    setError('');
    try {
      await reloadComments();
    } catch (requestError) {
      console.error('Failed to load comments:', requestError);
      setError('Comentariile nu au putut fi încărcate.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleComment = async (event) => {
    event.preventDefault();
    const content = commentText().trim();
    if (!content || commentPending()) return;

    setCommentPending(true);
    setError('');
    try {
      await api.createComment(props.post.id, content);
      setCommentText('');
      await reloadComments();
    } catch (requestError) {
      console.error('Failed to add comment:', requestError);
      setError('Comentariul nu a putut fi publicat.');
    } finally {
      setCommentPending(false);
    }
  };

  const resetEditor = () => {
    setEditing(false);
    setEditContent(props.post.content);
    setEditImageFile(null);
    setEditImagePreview(null);
    setRemoveImage(false);
    if (editFileInput) editFileInput.value = '';
  };

  const handleEditPost = async () => {
    const content = editContent().trim();
    if (!content || content.length > MAX_CONTENT_LENGTH || saving()) return;

    setSaving(true);
    setError('');
    try {
      let imageUrl = removeImage() ? null : props.post.image_url;
      if (editImageFile()) {
        const result = await api.uploadPostImage(editImageFile());
        imageUrl = result.image_url;
      }

      await api.updatePost(props.post.id, content, imageUrl);
      resetEditor();
      await props.onUpdate?.();
    } catch (requestError) {
      console.error('Failed to update post:', requestError);
      setError('Postarea nu a putut fi actualizată.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditImageChange = (event) => {
    const file = event.currentTarget.files?.[0];
    setError('');
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE) {
      event.currentTarget.value = '';
      setError('Imaginea trebuie să fie JPG, PNG sau WebP și să nu depășească 10 MB.');
      return;
    }

    setEditImageFile(file);
    setRemoveImage(false);
    const reader = new FileReader();
    reader.onload = () => setEditImagePreview(reader.result);
    reader.onerror = () => setError('Imaginea nu a putut fi citită.');
    reader.readAsDataURL(file);
  };

  const handleRemoveEditImage = () => {
    setEditImageFile(null);
    setEditImagePreview(null);
    setRemoveImage(true);
    if (editFileInput) editFileInput.value = '';
  };

  const handleDeletePost = async () => {
    if (!window.confirm('Ștergi definitiv această postare?')) return;
    setError('');
    try {
      await api.deletePost(props.post.id);
      await props.onDelete?.();
    } catch (requestError) {
      console.error('Failed to delete post:', requestError);
      setError('Postarea nu a putut fi ștearsă.');
    }
  };

  const handleEditComment = async (commentId) => {
    const content = editCommentText().trim();
    if (!content) return;
    setError('');
    try {
      await api.updateComment(commentId, content);
      setEditingCommentId(null);
      setEditCommentText('');
      await reloadComments();
    } catch (requestError) {
      console.error('Failed to update comment:', requestError);
      setError('Comentariul nu a putut fi actualizat.');
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Ștergi definitiv acest comentariu?')) return;
    setError('');
    try {
      await api.deleteComment(commentId);
      await reloadComments();
    } catch (requestError) {
      console.error('Failed to delete comment:', requestError);
      setError('Comentariul nu a putut fi șters.');
    }
  };

  return (
    <article class="surface post-card">
      <header class="post-header">
        <button type="button" class="post-author" onClick={() => openProfile(props.post.user.id)}>
          <Show
            when={props.post.user.avatar_url}
            fallback={<span class="avatar-fallback">{props.post.user.username.charAt(0).toUpperCase()}</span>}
          >
            <img class="avatar" src={getImageUrl(props.post.user.avatar_url)} alt="" loading="lazy" decoding="async" />
          </Show>
          <span class="post-author-copy">
            <span class="post-author-name">{props.post.user.username}</span>
            <time class="post-time" datetime={props.post.created_at} title={fullDate(props.post.created_at)}>
              {formatDate(props.post.created_at)}
            </time>
          </span>
        </button>

        <Show when={isOwn() && !editing()}>
          <div class="post-owner-actions" aria-label="Acțiuni postare">
            <button type="button" class="icon-button" onClick={() => setEditing(true)} aria-label="Editează postarea" title="Editează">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5 5 5M4 20l3.5-.7L20 6.8a2.1 2.1 0 0 0-3-3L4.7 16.3 4 20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
            </button>
            <button type="button" class="icon-button danger" onClick={handleDeletePost} aria-label="Șterge postarea" title="Șterge">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M9 7l1-3h4l1 3m3 0-1 14H7L6 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </div>
        </Show>
      </header>

      <Show when={!editing()}>
        <p class="post-content">{props.post.content}</p>
        <Show when={props.post.image_url}>
          <img
            class="post-media"
            src={getImageUrl(props.post.image_url)}
            alt={`Imagine publicată de ${props.post.user.username}`}
            loading="lazy"
            decoding="async"
          />
        </Show>
      </Show>

      <Show when={editing()}>
        <div class="post-editor">
          <label class="sr-only" for={`edit-post-${props.post.id}`}>Editează conținutul postării</label>
          <textarea
            id={`edit-post-${props.post.id}`}
            class="textarea"
            value={editContent()}
            onInput={(event) => setEditContent(event.currentTarget.value)}
            rows="4"
          />
          <div class={`character-count ${editContent().length > MAX_CONTENT_LENGTH ? 'is-over' : ''}`}>
            {editContent().length}/{MAX_CONTENT_LENGTH}
          </div>

          <Show when={editImagePreview() || (props.post.image_url && !removeImage())}>
            <div class="post-editor-preview">
              <img
                src={editImagePreview() || getImageUrl(props.post.image_url)}
                alt="Previzualizarea imaginii postării"
              />
              <button type="button" class="media-remove" onClick={handleRemoveEditImage} aria-label="Elimină imaginea">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
              </button>
            </div>
          </Show>

          <div class="editor-tools">
            <input
              ref={editFileInput}
              class="sr-only"
              type="file"
              id={`edit-image-${props.post.id}`}
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={handleEditImageChange}
            />
            <label for={`edit-image-${props.post.id}`} class="btn btn-secondary">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8" /><path d="m4 17 5-4 4 4 3-3 4 4" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
              {props.post.image_url || editImageFile() ? 'Schimbă imaginea' : 'Adaugă imagine'}
            </label>
            <Show when={(props.post.image_url || editImageFile()) && !removeImage()}>
              <button type="button" class="btn btn-danger-ghost" onClick={handleRemoveEditImage}>Elimină imaginea</button>
            </Show>
          </div>

          <div class="editor-actions">
            <button type="button" class="btn btn-secondary" onClick={resetEditor} disabled={saving()}>Anulează</button>
            <button
              type="button"
              class="btn btn-primary"
              onClick={handleEditPost}
              disabled={saving() || !editContent().trim() || editContent().length > MAX_CONTENT_LENGTH}
            >
              {saving() ? 'Se salvează…' : 'Salvează'}
            </button>
          </div>
        </div>
      </Show>

      <Show when={error()}><p class="inline-error post-error" role="alert">{error()}</p></Show>

      <div class="post-actions">
        <button
          type="button"
          class={`post-action ${liked() ? 'is-liked' : ''}`}
          onClick={handleLike}
          disabled={likePending()}
          aria-pressed={liked()}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill={liked() ? 'currentColor' : 'none'} aria-hidden="true">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
          </svg>
          <span>{likesCount()} <span class="post-action-word">{likesCount() === 1 ? 'apreciere' : 'aprecieri'}</span></span>
        </button>
        <button type="button" class="post-action" onClick={toggleComments} aria-expanded={showComments()}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.5-4.2A8.5 8.5 0 1 1 21 11.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
          <span>{commentsCount()} <span class="post-action-word">{commentsCount() === 1 ? 'comentariu' : 'comentarii'}</span></span>
        </button>
        <button
          type="button"
          class={`post-action ${saved() ? 'is-saved' : ''}`}
          onClick={handleSave}
          disabled={savePending()}
          aria-pressed={saved()}
          aria-label={saved() ? 'Elimină postarea din salvate' : 'Salvează postarea'}
          title={saved() ? 'Elimină din salvate' : 'Salvează'}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill={saved() ? 'currentColor' : 'none'} aria-hidden="true">
            <path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
          </svg>
          <span class="post-save-label">{saved() ? 'Salvată' : 'Salvează'}</span>
        </button>
      </div>

      <Show when={showComments()}>
        <section class="comments-panel" aria-label="Comentarii">
          <form class="comment-form" onSubmit={handleComment}>
            <label class="sr-only" for={`comment-${props.post.id}`}>Scrie un comentariu</label>
            <input
              id={`comment-${props.post.id}`}
              class="input"
              type="text"
              value={commentText()}
              onInput={(event) => setCommentText(event.currentTarget.value)}
              maxlength="500"
              placeholder="Scrie un comentariu…"
            />
            <button type="submit" class="btn btn-primary" disabled={commentPending() || !commentText().trim()}>
              {commentPending() ? 'Se trimite…' : 'Trimite'}
            </button>
          </form>

          <Show when={!commentsLoading()} fallback={<p class="comments-status">Se încarcă comentariile…</p>}>
            <Show when={comments().length > 0} fallback={<p class="comments-status">Fii primul care răspunde.</p>}>
              <div class="comment-list">
                <For each={comments()}>
                  {(comment) => (
                    <div class="comment">
                      <Show
                        when={editingCommentId() !== comment.id}
                        fallback={
                          <div class="comment-editor">
                            <label class="sr-only" for={`edit-comment-${comment.id}`}>Editează comentariul</label>
                            <input
                              id={`edit-comment-${comment.id}`}
                              class="input"
                              type="text"
                              value={editCommentText()}
                              onInput={(event) => setEditCommentText(event.currentTarget.value)}
                              maxlength="500"
                            />
                            <div class="comment-editor-actions">
                              <button type="button" class="btn btn-secondary" onClick={() => setEditingCommentId(null)}>Anulează</button>
                              <button type="button" class="btn btn-primary" onClick={() => handleEditComment(comment.id)}>Salvează</button>
                            </div>
                          </div>
                        }
                      >
                        <div class="comment-head">
                          <div>
                            <button type="button" class="comment-author" onClick={() => openProfile(comment.user.id)}>{comment.user.username}</button>
                            <time class="comment-time" datetime={comment.created_at} title={fullDate(comment.created_at)}>· {formatDate(comment.created_at)}</time>
                          </div>
                          <Show when={auth.user()?.id === comment.user.id}>
                            <div class="comment-actions">
                              <button
                                type="button"
                                class="comment-link"
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditCommentText(comment.content);
                                }}
                              >
                                Editează
                              </button>
                              <button type="button" class="comment-link danger" onClick={() => handleDeleteComment(comment.id)}>Șterge</button>
                            </div>
                          </Show>
                        </div>
                        <p class="comment-copy">{comment.content}</p>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </section>
      </Show>
    </article>
  );
}
