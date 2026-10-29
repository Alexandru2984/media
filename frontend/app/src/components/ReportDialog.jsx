import { Show, createSignal } from 'solid-js';
import { api } from '../api';

const reasons = [
  ['spam', 'Spam sau înșelătorie'],
  ['harassment', 'Hărțuire sau intimidare'],
  ['hate', 'Discurs instigator la ură'],
  ['violence', 'Violență sau amenințări'],
  ['sexual', 'Conținut sexual'],
  ['self_harm', 'Autovătămare'],
  ['impersonation', 'Uzurpare de identitate'],
  ['privacy', 'Încălcarea vieții private'],
  ['illegal', 'Activitate ilegală'],
  ['other', 'Alt motiv'],
];

export default function ReportDialog(props) {
  const [open, setOpen] = createSignal(false);
  const [reason, setReason] = createSignal('harassment');
  const [details, setDetails] = createSignal('');
  const [pending, setPending] = createSignal(false);
  const [reported, setReported] = createSignal(false);
  const [error, setError] = createSignal('');

  const close = () => {
    if (!pending()) setOpen(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (pending() || reported()) return;
    setPending(true);
    setError('');
    try {
      await api.createReport(props.targetType, props.targetId, reason(), details().trim());
      setReported(true);
      setOpen(false);
      props.onReported?.();
    } catch (requestError) {
      console.error('Failed to submit report:', requestError);
      if (requestError.status === 409) {
        setError('Ai deja o raportare deschisă pentru acest element. O poți retrage din Centrul de siguranță.');
      } else if (requestError.status === 429) {
        setError('Ai trimis prea multe raportări într-un interval scurt. Încearcă din nou mai târziu.');
      } else {
        setError('Raportarea nu a putut fi trimisă. Încearcă din nou.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        class={props.class || 'btn btn-danger-ghost'}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
        disabled={reported()}
        aria-label={reported() ? 'Raportare trimisă' : (props.ariaLabel || 'Raportează')}
        title={reported() ? 'Raportare trimisă' : 'Raportează'}
      >
        <Show
          when={!props.compact}
          fallback={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 21V4m0 1h11l-1.5 3L16 11H5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          }
        >
          {reported() ? 'Raportat' : (props.label || 'Raportează')}
        </Show>
      </button>

      <Show when={open()}>
        <div
          class="report-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            class="surface report-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`report-title-${props.targetType}-${props.targetId}`}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close();
            }}
          >
            <div class="report-dialog-head">
              <div>
                <p class="sidebar-eyebrow">Raportare confidențială</p>
                <h2 id={`report-title-${props.targetType}-${props.targetId}`}>Raportează {props.subjectLabel || 'acest conținut'}</h2>
              </div>
              <button type="button" class="icon-button" onClick={close} disabled={pending()} aria-label="Închide">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" /></svg>
              </button>
            </div>

            <form class="report-form" onSubmit={submit}>
              <div>
                <label class="field-label" for={`report-reason-${props.targetType}-${props.targetId}`}>Motiv</label>
                <select
                  id={`report-reason-${props.targetType}-${props.targetId}`}
                  class="input"
                  value={reason()}
                  onInput={(event) => setReason(event.currentTarget.value)}
                  autofocus
                >
                  {reasons.map(([value, label]) => <option value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label class="field-label" for={`report-details-${props.targetType}-${props.targetId}`}>Context opțional</label>
                <textarea
                  id={`report-details-${props.targetType}-${props.targetId}`}
                  class="textarea"
                  value={details()}
                  onInput={(event) => setDetails(event.currentTarget.value)}
                  maxlength="1000"
                  rows="4"
                  placeholder="Descrie pe scurt ce s-a întâmplat, fără date sensibile inutile."
                />
                <div class="character-count">{details().length}/1000</div>
              </div>
              <p class="report-privacy-note">Identitatea ta nu este afișată contului raportat. Raportarea rămâne vizibilă doar în centrul tău de siguranță.</p>
              <Show when={error()}><p class="alert alert-error" role="alert">{error()}</p></Show>
              <div class="report-dialog-actions">
                <button type="button" class="btn btn-secondary" onClick={close} disabled={pending()}>Anulează</button>
                <button type="submit" class="btn btn-primary" disabled={pending()}>{pending() ? 'Se trimite…' : 'Trimite raportarea'}</button>
              </div>
            </form>
          </section>
        </div>
      </Show>
    </>
  );
}
