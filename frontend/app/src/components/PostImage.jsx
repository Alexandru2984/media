import { createSignal, onCleanup, Show } from 'solid-js';
import { getImageUrl } from '../utils/urls';

export default function PostImage(props) {
  const [expanded, setExpanded] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let dialog;
  let trigger;
  const description = () => `Imagine publicată de ${props.author}`;
  const open = () => {
    setFailed(false);
    setExpanded(true);
    dialog.showModal();
    dialog.querySelector('button')?.focus();
  };
  const close = () => {
    setExpanded(false);
    trigger?.focus({ preventScroll: true });
  };
  onCleanup(() => { if (dialog?.open) dialog.close(); });

  return (
    <>
      <button ref={trigger} type="button" class="post-image-trigger" aria-haspopup="dialog" aria-label={`Mărește imaginea publicată de ${props.author}`} onClick={open}>
        <img class="post-media" src={getImageUrl(props.src)} alt={description()} loading="lazy" decoding="async" />
        <span class="post-image-hint" aria-hidden="true">Mărește imaginea</span>
      </button>
      <dialog ref={dialog} class="image-viewer" aria-label={description()} onClose={close} onKeyDown={(event) => {
        // This viewer has one interactive control. Keep both Tab directions
        // on it instead of allowing a browser to move focus into its chrome.
        if (event.key === 'Tab') { event.preventDefault(); dialog.querySelector('button')?.focus(); }
      }} onClick={(event) => { if (event.target === dialog) dialog.close(); }}>
        <div class="image-viewer-toolbar"><p>{description()}</p><button type="button" class="btn btn-secondary" autofocus onClick={() => dialog.close()} aria-label="Închide imaginea">Închide <span aria-hidden="true">×</span></button></div>
        <Show when={expanded()}>
          <Show when={!failed()} fallback={<p class="image-viewer-error" role="status">Imaginea nu mai este disponibilă. Este posibil ca autorul să fi schimbat accesul.</p>}>
            <img class="image-viewer-media" src={getImageUrl(props.src)} alt={description()} decoding="async" onError={() => setFailed(true)} />
          </Show>
        </Show>
        <p class="image-viewer-caption">Poți închide cu Escape sau atingând fundalul.</p>
      </dialog>
    </>
  );
}
