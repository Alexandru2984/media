import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';

// A profile has one pin. Serialize choices across the cards in this tab.
const [pending, setPending] = createSignal(false);

export default function ProfilePinButton(props) {
  const auth = useAuth();
  const [pinned, setPinned] = createSignal(Boolean(props.pinned));
  const [status, setStatus] = createSignal('');
  let alive = true;
  createEffect(() => setPinned(Boolean(props.pinned)));
  const sync = (event) => {
    if (event.detail?.userId === props.authorId) {
      setPinned(event.detail.postId === props.postId);
    }
  };
  onMount(() => window.addEventListener('media:profile-pin-changed', sync));
  onCleanup(() => {
    alive = false;
    window.removeEventListener('media:profile-pin-changed', sync);
  });

  const change = async () => {
    const viewer = auth.user()?.id;
    if (pending() || viewer !== props.authorId) return;
    const removing = pinned();
    setPending(true);
    props.onError?.('');
    setStatus('');
    try {
      const result = removing ? await api.unpinPost(props.postId) : await api.pinPost(props.postId);
      if (auth.user()?.id !== viewer) return;
      window.dispatchEvent(new CustomEvent('media:profile-pin-changed', {
        detail: { userId: viewer, postId: result.pinned_post_id },
      }));
      if (alive) {
        setStatus(removing ? 'Fixarea a fost eliminată.' : 'Postarea este fixată pe profil.');
        props.onChange?.(props.postId);
      }
    } catch {
      if (alive && auth.user()?.id === viewer) props.onError?.('Fixarea nu a putut fi actualizată. Încearcă din nou.');
    } finally {
      setPending(false);
    }
  };

  const label = () => pinned() ? 'Anulează fixarea pe profil' : 'Fixează pe profil';
  return <>
    <button type="button" class="icon-button profile-pin-button" data-profile-pin={props.postId} aria-label={label()} title={label()}
      aria-pressed={pinned()} disabled={pending()} onClick={change}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill={pinned() ? 'currentColor' : 'none'} aria-hidden="true">
        <path d="m15 3 6 6-3 1-4 4v4l-2 2-3-5-5-3 2-2h4l4-4 1-3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="m8 16-5 5" stroke="currentColor" stroke-width="1.8" />
      </svg>
    </button>
    <span class="sr-only" role="status">{status()}</span>
  </>;
}
