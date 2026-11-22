import { createEffect, createSignal, createUniqueId, onCleanup } from 'solid-js';
import Modal from './Modal';
import { shareInternalLink } from '../utils/sharing';

export default function ShareLink(props) {
  const [pending, setPending] = createSignal(false);
  const [message, setMessage] = createSignal('');
  const [manualUrl, setManualUrl] = createSignal('');
  const inputId = createUniqueId();
  let version = 0;
  onCleanup(() => { version += 1; });
  let trigger;
  createEffect(() => {
    props.path;
    version += 1;
    setMessage('');
    setManualUrl('');
    setPending(false);
  });

  const share = async () => {
    if (pending()) return;
    const requestVersion = ++version;
    setPending(true);
    setMessage('');
    try {
      const result = await shareInternalLink(props.path, props.title);
      if (requestVersion !== version) return;
      if (result.status === 'shared') setMessage('Link distribuit.');
      if (result.status === 'copied') setMessage('Link copiat.');
      if (result.status === 'manual') setManualUrl(result.url);
    } catch {
      if (requestVersion === version) setMessage('Linkul nu este disponibil. Încearcă din nou.');
    } finally {
      if (requestVersion === version) setPending(false);
    }
  };

  return <>
    <button ref={trigger} type="button" class="btn btn-secondary" onClick={share} disabled={pending()} aria-label={message() || props.label || 'Distribuie'} title={message() || props.label || 'Distribuie'}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="1.8" /><circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="1.8" /><circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="1.8" /><path d="m8.7 10.7 6.6-4.2m-6.6 6.8 6.6 4.2" stroke="currentColor" stroke-width="1.8" /></svg>
      <span aria-live="polite">{pending() ? 'Se deschide…' : message() || props.label || 'Distribuie'}</span>
    </button>
    <Modal open={Boolean(manualUrl())} onClose={() => { setManualUrl(''); trigger?.focus({ preventScroll: true }); }} label="Copiază linkul">
      <div class="report-dialog-head"><h2>Copiază linkul</h2><button type="button" class="icon-button" aria-label="Închide copierea linkului" onClick={() => setManualUrl('')}>×</button></div>
      <p class="report-privacy-note">Selectează și copiază linkul. Accesul la conținut respectă în continuare setările contului.</p>
      <label class="field-label" for={inputId}>Link de distribuit</label>
      <input id={inputId} class="input" type="url" readonly value={manualUrl()} autofocus onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} />
      <div class="report-dialog-actions"><button type="button" class="btn btn-primary" onClick={() => setManualUrl('')}>Gata</button></div>
    </Modal>
  </>;
}
