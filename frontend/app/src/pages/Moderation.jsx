import { A, useNavigate } from '@solidjs/router';
import { For, Show, createEffect, createSignal } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';

const PAGE_SIZE = 20;
const privilegedRoles = ['moderator', 'admin'];
const dateFormatter = new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
const tabs = [
  ['open', 'De preluat'],
  ['reviewing', 'În analiză'],
  ['resolved', 'Rezolvate'],
  ['dismissed', 'Închise'],
  ['audit', 'Audit'],
];
const reasonLabels = {
  spam: 'Spam sau înșelătorie',
  harassment: 'Hărțuire sau intimidare',
  hate: 'Discurs instigator la ură',
  violence: 'Violență sau amenințări',
  sexual: 'Conținut sexual',
  self_harm: 'Autovătămare',
  impersonation: 'Uzurpare de identitate',
  privacy: 'Încălcarea vieții private',
  illegal: 'Activitate ilegală',
  other: 'Alt motiv',
};
const targetLabels = { user: 'Cont', post: 'Postare', comment: 'Comentariu' };
const actionLabels = {
  report_claimed: 'Raportare preluată',
  report_released: 'Raportare eliberată',
  report_resolved: 'Raportare rezolvată',
  report_dismissed: 'Raportare închisă',
};

export default function Moderation() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = createSignal('open');
  const [reports, setReports] = createSignal([]);
  const [auditEvents, setAuditEvents] = createSignal([]);
  const [roleEvents, setRoleEvents] = createSignal([]);
  const [hasMore, setHasMore] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal('');
  const [success, setSuccess] = createSignal('');
  const [loadedKey, setLoadedKey] = createSignal('');
  const [dialog, setDialog] = createSignal(null);
  const [password, setPassword] = createSignal('');
  const [decision, setDecision] = createSignal('resolved');
  const [note, setNote] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);

  const load = async (append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const offset = append
        ? (activeTab() === 'audit'
          ? auditEvents().length
          : (activeTab() === 'roles' ? roleEvents().length : reports().length))
        : 0;
      const data = activeTab() === 'audit'
        ? await api.getModerationAudit(PAGE_SIZE, offset)
        : (activeTab() === 'roles'
          ? await api.getModerationRoleAudit(PAGE_SIZE, offset)
          : await api.getModerationReports(activeTab(), PAGE_SIZE, offset));
      if (activeTab() === 'audit') {
        setAuditEvents((current) => (append ? [...current, ...data] : data));
      } else if (activeTab() === 'roles') {
        setRoleEvents((current) => (append ? [...current, ...data] : data));
      } else {
        setReports((current) => (append ? [...current, ...data] : data));
      }
      setHasMore(data.length === PAGE_SIZE);
    } catch (requestError) {
      console.error('Failed to load moderation workspace:', requestError);
      if (requestError.status === 403) {
        navigate('/');
      } else {
        setError('Spațiul de moderare nu a putut fi încărcat. Încearcă din nou.');
      }
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const selectTab = (tab) => {
    if (tab === activeTab()) return;
    setActiveTab(tab);
    setReports([]);
    setAuditEvents([]);
    setRoleEvents([]);
    setHasMore(false);
    setSuccess('');
    setLoadedKey('');
  };

  const openDialog = (type, report) => {
    setPassword('');
    setDecision('resolved');
    setNote('');
    setError('');
    setDialog({ type, report });
  };

  const closeDialog = () => {
    if (!submitting()) setDialog(null);
  };

  const submitAction = async (event) => {
    event.preventDefault();
    const current = dialog();
    if (!current || submitting()) return;
    if (current.type === 'decision' && !note().trim()) {
      setError('Nota internă este obligatorie pentru o decizie.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      if (current.type === 'claim') {
        await api.claimModerationReport(current.report.id, password());
        setSuccess('Raportarea a fost preluată și mutată în lista „În analiză”.');
      } else if (current.type === 'release') {
        await api.releaseModerationReport(current.report.id, password());
        setSuccess('Raportarea a revenit în coada comună.');
      } else {
        await api.decideModerationReport(
          current.report.id,
          password(),
          decision(),
          note().trim(),
        );
        setSuccess(decision() === 'resolved'
          ? 'Raportarea a fost marcată drept rezolvată.'
          : 'Raportarea a fost închisă fără acțiune.');
      }
      setDialog(null);
      await load(false);
    } catch (requestError) {
      console.error('Moderation action failed:', requestError);
      if (requestError.status === 401) {
        setError('Parola nu este corectă. Acțiunea nu a fost aplicată.');
      } else if (requestError.status === 403) {
        setError('Nu ai dreptul să procesezi această raportare sau există un conflict de interese.');
      } else if (requestError.status === 409) {
        setError('Starea raportării s-a schimbat. Închide dialogul și reîncarcă lista.');
      } else {
        setError('Acțiunea nu a putut fi aplicată. Încearcă din nou.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  createEffect(() => {
    if (auth.loading()) return;
    if (!auth.isAuthenticated()) {
      navigate('/login');
      return;
    }
    if (!privilegedRoles.includes(auth.user()?.role)) {
      navigate('/');
      return;
    }
    const key = `${auth.user()?.id}:${activeTab()}`;
    if (loadedKey() !== key) {
      setLoadedKey(key);
      void load(false);
    }
  });

  const visibleTabs = () => (auth.user()?.role === 'admin'
    ? [...tabs, ['roles', 'Roluri']]
    : tabs);

  return (
    <>
      <PageMeta
        title="Moderare — Media"
        description="Spațiu privat pentru trierea raportărilor și auditul acțiunilor de moderare."
        canonicalPath="/moderare"
        noIndex
      />
      <Navbar />
      <main class="moderation-page app-container">
        <header class="moderation-hero">
          <span class="moderation-hero-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 3 4.5 6v5.5c0 4.8 3 7.9 7.5 9.5 4.5-1.6 7.5-4.7 7.5-9.5V6L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><path d="M8.5 12h7M12 8.5v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          </span>
          <div>
            <p class="sidebar-eyebrow">Acces {auth.user()?.role === 'admin' ? 'administrator' : 'moderator'}</p>
            <h1>Centru de moderare</h1>
            <p>Triază raportările fără a vedea identitatea raportorului. Fiecare schimbare este reautentificată și auditată.</p>
          </div>
        </header>

        <div class="surface moderation-policy-note">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.8 3 7.9 7.5 9.5 4.5-1.6 7.5-4.7 7.5-9.5V6L12 3Z" stroke="currentColor" stroke-width="1.8" /><path d="M12 8v5m0 3h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          <p>O decizie închide fluxul de triere, dar nu șterge automat conținutul și nu suspendă conturi. Verifică <A href="/reguli">regulile comunității</A>, documentează motivul minim necesar și evită datele sensibile în note.</p>
        </div>

        <div class="moderation-tabs" role="tablist" aria-label="Stări de moderare">
          <For each={visibleTabs()}>{([value, label]) => (
            <button type="button" role="tab" aria-selected={activeTab() === value} class={activeTab() === value ? 'is-active' : ''} onClick={() => selectTab(value)}>
              {label}
            </button>
          )}</For>
        </div>

        <Show when={success()}><p class="alert alert-success moderation-alert" role="status">{success()}</p></Show>
        <Show when={error() && !dialog()}><p class="alert alert-error moderation-alert" role="alert">{error()}</p></Show>

        <Show when={!loading()} fallback={<div class="surface skeleton"><div class="skeleton-lines"><div class="skeleton-line" /><div class="skeleton-line" /><div class="skeleton-line" /></div></div>}>
          <Show
            when={!['audit', 'roles'].includes(activeTab())}
            fallback={
              <Show
                when={activeTab() === 'roles'}
                fallback={
                  <Show when={auditEvents().length > 0} fallback={<div class="surface state-card"><div><span class="state-icon">✓</span><h2>Nicio acțiune auditată</h2><p>Evenimentele apar aici după prima tranziție de moderare.</p></div></div>}>
                    <div class="moderation-audit-list">
                      <For each={auditEvents()}>{(event) => (
                        <article class="surface moderation-audit-card">
                          <span class="moderation-audit-mark" aria-hidden="true">↳</span>
                          <div>
                            <p class="moderation-card-kicker">{actionLabels[event.action] || event.action}</p>
                            <h2>{event.moderator_username || 'Cont de moderator șters'}</h2>
                            <p><code>{event.report_reference}</code> · {event.previous_status} → {event.new_status}</p>
                            <time datetime={event.created_at}>{dateFormatter.format(new Date(event.created_at))}</time>
                          </div>
                        </article>
                      )}</For>
                    </div>
                  </Show>
                }
              >
                <Show when={roleEvents().length > 0} fallback={<div class="surface state-card"><div><span class="state-icon">✓</span><h2>Nicio schimbare de rol</h2><p>Promovările și revocările offline vor apărea automat aici.</p></div></div>}>
                  <div class="moderation-audit-list">
                    <For each={roleEvents()}>{(event) => (
                      <article class="surface moderation-audit-card moderation-role-card">
                        <span class="moderation-audit-mark" aria-hidden="true">◆</span>
                        <div>
                          <p class="moderation-card-kicker">Schimbare privilegiu</p>
                          <h2>{event.username_snapshot}</h2>
                          <p><code>{event.user_reference}</code> · {event.previous_role} → {event.new_role}</p>
                          <time datetime={event.created_at}>{dateFormatter.format(new Date(event.created_at))}</time>
                        </div>
                      </article>
                    )}</For>
                  </div>
                </Show>
              </Show>
            }
          >
            <Show when={reports().length > 0} fallback={<div class="surface state-card"><div><span class="state-icon">✓</span><h2>Coada este liberă</h2><p>Nu există raportări vizibile pentru această stare și pentru nivelul tău de acces.</p></div></div>}>
              <div class="moderation-list">
                <For each={reports()}>{(report) => (
                  <article class="surface moderation-card">
                    <div class="moderation-card-head">
                      <div>
                        <p class="moderation-card-kicker">{targetLabels[report.target_type] || 'Conținut'} · {reasonLabels[report.reason] || report.reason}</p>
                        <h2>
                          <Show when={report.target_type === 'user'} fallback={report.target_label}>
                            <A href={`/profile/${report.target_id}`}>{report.target_label}</A>
                          </Show>
                        </h2>
                      </div>
                      <span class={`moderation-status moderation-status-${report.status}`}>{tabs.find(([value]) => value === report.status)?.[1] || report.status}</span>
                    </div>

                    <Show when={report.target_excerpt}>
                      <div class="moderation-evidence"><span>Extras păstrat</span><p>{report.target_excerpt}</p></div>
                    </Show>
                    <Show when={report.details}>
                      <div class="moderation-context"><span>Contextul raportării</span><p>{report.details}</p></div>
                    </Show>
                    <Show when={report.resolution_note}>
                      <div class="moderation-resolution"><span>Notă internă de decizie</span><p>{report.resolution_note}</p></div>
                    </Show>

                    <div class="moderation-card-meta">
                      <span>Trimisă {dateFormatter.format(new Date(report.created_at))}</span>
                      <Show when={report.assigned_moderator_username}>
                        <span>Preluată de {report.assigned_moderator_username}<Show when={report.assigned_to_me}> (tu)</Show></span>
                      </Show>
                    </div>

                    <Show when={report.status === 'open'}>
                      <div class="moderation-card-actions">
                        <button type="button" class="btn btn-primary" onClick={() => openDialog('claim', report)}>Preia raportarea</button>
                      </div>
                    </Show>
                    <Show when={report.status === 'reviewing'}>
                      <div class="moderation-card-actions">
                        <button type="button" class="btn btn-secondary" onClick={() => openDialog('release', report)}>Eliberează</button>
                        <button type="button" class="btn btn-primary" onClick={() => openDialog('decision', report)}>Înregistrează decizia</button>
                      </div>
                    </Show>
                  </article>
                )}</For>
              </div>
            </Show>
          </Show>

          <Show when={hasMore()}>
            <div class="moderation-load-more"><button type="button" class="btn btn-secondary" onClick={() => load(true)} disabled={loadingMore()}>{loadingMore() ? 'Se încarcă…' : 'Încarcă mai multe'}</button></div>
          </Show>
        </Show>
      </main>

      <Show when={dialog()}>
        <div class="report-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section class="surface report-dialog moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="moderation-dialog-title" onKeyDown={(event) => { if (event.key === 'Escape') closeDialog(); }}>
            <div class="report-dialog-head">
              <div>
                <p class="sidebar-eyebrow">Confirmare privilegiată</p>
                <h2 id="moderation-dialog-title">
                  {dialog()?.type === 'claim' ? 'Preia raportarea' : (dialog()?.type === 'release' ? 'Eliberează raportarea' : 'Înregistrează decizia')}
                </h2>
              </div>
              <button type="button" class="icon-button" onClick={closeDialog} disabled={submitting()} aria-label="Închide">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" /></svg>
              </button>
            </div>
            <form class="moderation-action-form" onSubmit={submitAction}>
              <Show when={dialog()?.type === 'decision'}>
                <div>
                  <label class="field-label" for="moderation-decision">Decizie</label>
                  <select id="moderation-decision" class="input" value={decision()} onInput={(event) => setDecision(event.currentTarget.value)}>
                    <option value="resolved">Rezolvată administrativ</option>
                    <option value="dismissed">Închisă fără acțiune</option>
                  </select>
                </div>
                <div>
                  <label class="field-label" for="moderation-note">Notă internă obligatorie</label>
                  <textarea id="moderation-note" class="textarea" rows="4" maxlength="1000" value={note()} onInput={(event) => setNote(event.currentTarget.value)} placeholder="Motivul concis al deciziei; nu copia date sensibile inutile." />
                  <div class="character-count">{note().length}/1000</div>
                </div>
              </Show>
              <div>
                <label class="field-label" for="moderation-password">Confirmă cu parola actuală</label>
                <input id="moderation-password" class="input" type="password" autocomplete="current-password" value={password()} onInput={(event) => setPassword(event.currentTarget.value)} required autofocus />
              </div>
              <p class="moderation-step-up-note">Parola este verificată pentru această acțiune și nu este păstrată în jurnalul de audit.</p>
              <Show when={error()}><p class="alert alert-error" role="alert">{error()}</p></Show>
              <div class="report-dialog-actions">
                <button type="button" class="btn btn-secondary" onClick={closeDialog} disabled={submitting()}>Anulează</button>
                <button type="submit" class="btn btn-primary" disabled={submitting() || !password()}>{submitting() ? 'Se confirmă…' : 'Confirmă acțiunea'}</button>
              </div>
            </form>
          </section>
        </div>
      </Show>
    </>
  );
}
