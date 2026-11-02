import { createMemo, For, Show } from 'solid-js';
import { getProfileCompletion } from '../utils/profileCompletion';

const stepIcons = {
  avatar: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  bio: <><path d="M5 4h14v16H5V4Z" /><path d="M8 8h8m-8 4h8m-8 4h5" /></>,
  post: <><path d="M12 5v14M5 12h14" /><rect x="3" y="3" width="18" height="18" rx="5" /></>,
  connection: <><circle cx="9" cy="8" r="3" /><path d="M3 19a6 6 0 0 1 12 0M16 7h5m-2.5-2.5v5" /></>,
};

export default function ProfileCompletion(props) {
  const completion = createMemo(() => getProfileCompletion(props.profile, props.postCount));

  const runAction = (stepId) => {
    const action = props.actions?.[stepId];
    if (typeof action === 'function') action();
  };

  return (
    <Show when={completion().percent < 100}>
      <section class="surface profile-completion" aria-labelledby="profile-completion-title">
        <header class="profile-completion-header">
          <div
            class="profile-completion-ring"
            role="progressbar"
            aria-label="Progresul profilului"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={completion().percent}
            style={{ '--profile-progress': `${completion().percent * 3.6}deg` }}
          >
            <span>{completion().percent}%</span>
          </div>
          <div>
            <p class="sidebar-eyebrow">Primii pași</p>
            <h2 id="profile-completion-title">Fă-ți profilul mai ușor de descoperit</h2>
            <p>{completion().completed} din {completion().total} pași finalizați. Progresul este calculat din profilul tău, fără urmărire suplimentară.</p>
          </div>
        </header>

        <div class="profile-completion-steps">
          <For each={completion().steps}>{(step, index) => (
            <article class={`profile-completion-step ${step.complete ? 'is-complete' : ''}`}>
              <span class="profile-completion-step-icon" aria-hidden="true">
                <Show
                  when={!step.complete}
                  fallback={<svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>}
                >
                  <svg viewBox="0 0 24 24" fill="none">
                    <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{stepIcons[step.id]}</g>
                  </svg>
                </Show>
              </span>
              <div class="profile-completion-step-copy">
                <strong><span class="sr-only">Pasul {index() + 1}: </span>{step.title}</strong>
                <small>{step.complete ? 'Finalizat' : step.description}</small>
              </div>
              <Show when={!step.complete}>
                <button type="button" class="btn btn-secondary" onClick={() => runAction(step.id)}>{step.actionLabel}</button>
              </Show>
            </article>
          )}</For>
        </div>
      </section>
    </Show>
  );
}
