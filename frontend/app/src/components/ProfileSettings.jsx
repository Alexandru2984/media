import { createSignal, For, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { getImageUrl } from '../utils/urls';
import { getPasswordPolicyError } from '../utils/passwords';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SECURITY_EVENT_COPY = Object.freeze({
  account_created: ['Cont creat', 'Contul și prima sesiune au fost create.'],
  login_succeeded: ['Autentificare reușită', 'O sesiune nouă a fost deschisă.'],
  logged_out: ['Deconectare', 'O sesiune a fost închisă normal.'],
  session_revoked: ['Sesiune închisă de la distanță', 'Ai revocat accesul unei alte sesiuni.'],
  other_sessions_revoked: ['Celelalte sesiuni închise', 'Ai păstrat activă numai sesiunea curentă.'],
  password_changed: ['Parolă schimbată', 'Parola a fost actualizată și sesiunile vechi au fost revocate.'],
  password_reset: ['Parolă resetată', 'Parola a fost înlocuită prin fluxul securizat de recuperare.'],
  email_change_requested: ['Schimbare de email solicitată', 'A fost trimisă confirmarea către noua adresă.'],
  email_changed: ['Adresă de email schimbată', 'Noua adresă a fost confirmată și sesiunile vechi au fost închise.'],
  email_verified: ['Adresă de email verificată', 'Adresa contului a fost confirmată.'],
  account_data_exported: ['Date exportate', 'A fost generată o copie a datelor contului.'],
});

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Dată indisponibilă';
  return date.toLocaleString('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function securityEventCopy(eventType) {
  return SECURITY_EVENT_COPY[eventType] || ['Activitate de securitate', 'A fost înregistrată o acțiune de protecție a contului.'];
}

export default function ProfileSettings(props) {
  const auth = useAuth();
  const [activeTab, setActiveTab] = createSignal('avatar');
  const [avatarFile, setAvatarFile] = createSignal(null);
  const [avatarPreview, setAvatarPreview] = createSignal(null);
  const [uploadingAvatar, setUploadingAvatar] = createSignal(false);
  const [oldPassword, setOldPassword] = createSignal('');
  const [newPassword, setNewPassword] = createSignal('');
  const [confirmPassword, setConfirmPassword] = createSignal('');
  const [changingPassword, setChangingPassword] = createSignal(false);
  const [newEmail, setNewEmail] = createSignal('');
  const [emailPassword, setEmailPassword] = createSignal('');
  const [changingEmail, setChangingEmail] = createSignal(false);
  const [sessions, setSessions] = createSignal([]);
  const [sessionsLoaded, setSessionsLoaded] = createSignal(false);
  const [loadingSessions, setLoadingSessions] = createSignal(false);
  const [revokingSession, setRevokingSession] = createSignal('');
  const [securityEvents, setSecurityEvents] = createSignal([]);
  const [securityEventsLoaded, setSecurityEventsLoaded] = createSignal(false);
  const [loadingSecurityEvents, setLoadingSecurityEvents] = createSignal(false);
  const [securityEventRetentionDays, setSecurityEventRetentionDays] = createSignal(90);
  const [exportPassword, setExportPassword] = createSignal('');
  const [exportingData, setExportingData] = createSignal(false);
  const [deletePassword, setDeletePassword] = createSignal('');
  const [deleteConfirmation, setDeleteConfirmation] = createSignal('');
  const [deletingAccount, setDeletingAccount] = createSignal(false);
  const [message, setMessage] = createSignal({ type: '', text: '' });
  let avatarInput;
  let messageTimeout;

  const showMessage = (type, text) => {
    window.clearTimeout(messageTimeout);
    setMessage({ type, text });
    messageTimeout = window.setTimeout(() => setMessage({ type: '', text: '' }), 6000);
  };

  const loadSessions = async () => {
    if (loadingSessions()) return;
    setLoadingSessions(true);
    try {
      const data = await api.getSessions();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setSessionsLoaded(true);
    } catch (requestError) {
      console.error('Failed to load sessions:', requestError);
      showMessage('error', 'Sesiunile active nu au putut fi încărcate.');
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadSecurityEvents = async () => {
    if (loadingSecurityEvents()) return;
    setLoadingSecurityEvents(true);
    try {
      const data = await api.getSecurityEvents();
      setSecurityEvents(Array.isArray(data.events) ? data.events : []);
      setSecurityEventRetentionDays(Number(data.retention_days) || 90);
      setSecurityEventsLoaded(true);
    } catch (requestError) {
      console.error('Failed to load security events:', requestError);
      showMessage('error', 'Activitatea de securitate nu a putut fi încărcată.');
    } finally {
      setLoadingSecurityEvents(false);
    }
  };

  const selectTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'sessions' && !sessionsLoaded()) loadSessions();
    if (tab === 'security' && !securityEventsLoaded()) loadSecurityEvents();
  };

  const handleSessionRevoke = async (session) => {
    if (session.current || revokingSession()) return;
    if (!window.confirm('Închizi această sesiune? Dispozitivul respectiv va trebui să se autentifice din nou.')) return;

    setRevokingSession(session.id);
    try {
      await api.revokeSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      setSecurityEventsLoaded(false);
      showMessage('success', 'Sesiunea a fost închisă.');
    } catch (requestError) {
      console.error('Failed to revoke session:', requestError);
      showMessage('error', 'Sesiunea nu a putut fi închisă. Reîncarcă lista și încearcă din nou.');
    } finally {
      setRevokingSession('');
    }
  };

  const handleOtherSessionsRevoke = async () => {
    if (sessions().length <= 1 || revokingSession()) return;
    if (!window.confirm('Închizi toate celelalte sesiuni? Vei rămâne conectat numai aici.')) return;

    setRevokingSession('all');
    try {
      const result = await api.revokeOtherSessions();
      setSessions((current) => current.filter((session) => session.current));
      const revoked = Number(result.revoked) || 0;
      setSecurityEventsLoaded(false);
      showMessage('success', revoked === 1 ? 'Cealaltă sesiune a fost închisă.' : `${revoked} sesiuni au fost închise.`);
    } catch (requestError) {
      console.error('Failed to revoke other sessions:', requestError);
      showMessage('error', 'Celelalte sesiuni nu au putut fi închise.');
    } finally {
      setRevokingSession('');
    }
  };

  const handleAvatarChange = (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      event.currentTarget.value = '';
      showMessage('error', 'Alege o imagine JPG, PNG sau WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      event.currentTarget.value = '';
      showMessage('error', 'Avatarul nu poate depăși 5 MB.');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result);
    reader.onerror = () => showMessage('error', 'Imaginea nu a putut fi citită.');
    reader.readAsDataURL(file);
  };

  const clearAvatarSelection = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (avatarInput) avatarInput.value = '';
  };

  const handleAvatarUpload = async (event) => {
    event.preventDefault();
    if (!avatarFile() || uploadingAvatar()) return;

    setUploadingAvatar(true);
    try {
      await api.uploadAvatar(avatarFile());
      clearAvatarSelection();
      const userData = await api.getCurrentUser();
      auth.setUser(userData);
      await props.onUpdate?.();
      showMessage('success', 'Avatarul a fost actualizat.');
    } catch (requestError) {
      console.error('Failed to upload avatar:', requestError);
      showMessage('error', 'Avatarul nu a putut fi încărcat.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    if (newPassword() !== confirmPassword()) {
      showMessage('error', 'Parolele noi nu se potrivesc.');
      return;
    }
    const policyError = getPasswordPolicyError(newPassword());
    if (policyError) {
      showMessage('error', policyError);
      return;
    }
    if (oldPassword() === newPassword()) {
      showMessage('error', 'Parola nouă trebuie să fie diferită de cea actuală.');
      return;
    }

    setChangingPassword(true);
    try {
      await api.changePassword(oldPassword(), newPassword());
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSessionsLoaded(false);
      setSecurityEventsLoaded(false);
      showMessage('success', 'Parola a fost schimbată.');
    } catch (requestError) {
      console.error('Failed to change password:', requestError);
      showMessage('error', 'Parola nu a putut fi schimbată. Verifică parola actuală.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleEmailChange = async (event) => {
    event.preventDefault();
    if (!newEmail().trim() || !emailPassword() || changingEmail()) return;

    setChangingEmail(true);
    try {
      await api.changeEmail(newEmail().trim(), emailPassword());
      setNewEmail('');
      setEmailPassword('');
      setSecurityEventsLoaded(false);
      showMessage('success', 'Am trimis confirmarea la noua adresă. Linkul este valabil 24 de ore.');
    } catch (requestError) {
      console.error('Failed to change email:', requestError);
      showMessage('error', 'Adresa nu a putut fi schimbată. Verifică parola și adresa introdusă.');
    } finally {
      setChangingEmail(false);
    }
  };

  const handleDataExport = async (event) => {
    event.preventDefault();
    if (!exportPassword() || exportingData()) return;

    setExportingData(true);
    try {
      const exportData = await api.exportAccountData(exportPassword());
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = `media-date-cont-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setSecurityEventsLoaded(false);
      showMessage('success', 'Copia datelor a fost generată și descărcată.');
    } catch (requestError) {
      console.error('Failed to export account data:', requestError);
      showMessage('error', requestError.status === 401
        ? 'Parola introdusă nu este corectă.'
        : 'Copia datelor nu a putut fi generată. Încearcă din nou.');
    } finally {
      setExportPassword('');
      setExportingData(false);
    }
  };

  const handleAccountDeletion = async (event) => {
    event.preventDefault();
    if (deleteConfirmation() !== 'STERGE CONTUL') {
      showMessage('error', 'Scrie exact STERGE CONTUL pentru a confirma.');
      return;
    }
    if (!deletePassword() || deletingAccount()) return;
    if (!window.confirm('Ștergi definitiv contul? Postările, mesajele, sesiunile și fișierele asociate nu vor mai putea fi recuperate.')) return;

    setDeletingAccount(true);
    try {
      await api.deleteAccount(deletePassword(), deleteConfirmation());
      auth.setUser(null);
      window.location.replace('/');
    } catch (requestError) {
      console.error('Failed to delete account:', requestError);
      showMessage('error', requestError.status === 401
        ? 'Parola introdusă nu este corectă.'
        : 'Contul nu a putut fi șters. Datele au rămas neschimbate; încearcă din nou.');
      setDeletePassword('');
      setDeletingAccount(false);
    }
  };

  return (
    <section class="settings-layout" aria-labelledby="account-settings-title">
      <header class="settings-heading">
        <div>
          <p class="sidebar-eyebrow">Contul tău</p>
          <h2 id="account-settings-title">Setări și securitate</h2>
          <p>Administrează identitatea, accesul și datele contului.</p>
        </div>
      </header>

      <div class="settings-grid">
        <div class="settings-nav surface" role="tablist" aria-label="Categorii de setări">
          <button type="button" role="tab" aria-selected={activeTab() === 'avatar'} class={activeTab() === 'avatar' ? 'is-active' : ''} onClick={() => selectTab('avatar')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8" /><path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" /></svg>
            <span><strong>Avatar</strong><small>Poza profilului</small></span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab() === 'password'} class={activeTab() === 'password' ? 'is-active' : ''} onClick={() => selectTab('password')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.8" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
            <span><strong>Parolă</strong><small>Protecția contului</small></span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab() === 'email'} class={activeTab() === 'email' ? 'is-active' : ''} onClick={() => selectTab('email')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8" /><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
            <span><strong>Email</strong><small>Adresa de conectare</small></span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab() === 'sessions'} class={activeTab() === 'sessions' ? 'is-active' : ''} onClick={() => selectTab('sessions')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 8.2 7 10 4.1-1.8 7-5.4 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><path d="m9.5 12 1.7 1.7 3.6-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span><strong>Sesiuni</strong><small>Dispozitive conectate</small></span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab() === 'security'} class={`settings-nav-security ${activeTab() === 'security' ? 'is-active' : ''}`} onClick={() => selectTab('security')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5v-13Z" stroke="currentColor" stroke-width="1.8" /><path d="M9 8h6m-6 4h6m-6 4h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
            <span><strong>Activitate</strong><small>Istoric de securitate</small></span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab() === 'data'} class={`settings-nav-data ${activeTab() === 'data' ? 'is-active' : ''}`} onClick={() => selectTab('data')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span><strong>Date și cont</strong><small>Export sau ștergere</small></span>
          </button>
        </div>

        <div class="surface settings-panel">
          <Show when={message().text}>
            <div class={`alert ${message().type === 'error' ? 'alert-error' : 'alert-success'}`} role="status">{message().text}</div>
          </Show>

          <Show when={activeTab() === 'avatar'}>
            <div class="settings-section">
              <h3>Schimbă avatarul</h3>
              <p class="settings-description">Folosește o imagine clară, pătrată, de maximum 5 MB.</p>
              <form class="settings-form" onSubmit={handleAvatarUpload}>
                <div class="avatar-editor">
                  <Show
                    when={avatarPreview() || auth.user()?.avatar_url}
                    fallback={<span class="settings-avatar avatar-fallback">{auth.user()?.username?.charAt(0).toUpperCase()}</span>}
                  >
                    <img class="settings-avatar avatar" src={avatarPreview() || getImageUrl(auth.user()?.avatar_url)} alt="Previzualizarea avatarului" />
                  </Show>
                  <div class="avatar-editor-copy">
                    <input ref={avatarInput} id="avatar-upload" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={handleAvatarChange} />
                    <label for="avatar-upload" class="btn btn-secondary">{avatarFile() ? 'Alege altă imagine' : 'Alege o imagine'}</label>
                    <p>JPG, PNG sau WebP. Maximum 5 MB.</p>
                  </div>
                </div>
                <Show when={avatarFile()}>
                  <div class="settings-actions">
                    <button type="button" class="btn btn-secondary" onClick={clearAvatarSelection} disabled={uploadingAvatar()}>Anulează</button>
                    <button type="submit" class="btn btn-primary" disabled={uploadingAvatar()}>{uploadingAvatar() ? 'Se încarcă…' : 'Actualizează avatarul'}</button>
                  </div>
                </Show>
              </form>
            </div>
          </Show>

          <Show when={activeTab() === 'password'}>
            <div class="settings-section">
              <h3>Schimbă parola</h3>
              <p class="settings-description">Alege o parolă unică, de 12–72 de caractere.</p>
              <form class="settings-form" onSubmit={handlePasswordChange}>
                <div>
                  <label class="field-label" for="current-password">Parola actuală</label>
                  <input id="current-password" class="input" type="password" value={oldPassword()} onInput={(event) => setOldPassword(event.currentTarget.value)} autocomplete="current-password" required />
                </div>
                <div>
                  <label class="field-label" for="new-password">Parola nouă</label>
                  <input id="new-password" class="input" type="password" value={newPassword()} onInput={(event) => setNewPassword(event.currentTarget.value)} autocomplete="new-password" minlength="12" maxlength="72" required />
                </div>
                <div>
                  <label class="field-label" for="confirm-password">Confirmă parola nouă</label>
                  <input id="confirm-password" class="input" type="password" value={confirmPassword()} onInput={(event) => setConfirmPassword(event.currentTarget.value)} autocomplete="new-password" minlength="12" maxlength="72" required />
                </div>
                <div class="settings-actions"><button type="submit" class="btn btn-primary" disabled={changingPassword()}>{changingPassword() ? 'Se actualizează…' : 'Schimbă parola'}</button></div>
              </form>
            </div>
          </Show>

          <Show when={activeTab() === 'email'}>
            <div class="settings-section">
              <h3>Schimbă adresa de email</h3>
              <p class="settings-description">Noua adresă devine activă numai după confirmarea linkului primit prin email.</p>
              <form class="settings-form" onSubmit={handleEmailChange}>
                <div>
                  <label class="field-label" for="new-email">Noua adresă</label>
                  <input id="new-email" class="input" type="email" value={newEmail()} onInput={(event) => setNewEmail(event.currentTarget.value)} autocomplete="email" maxlength="190" placeholder="nume@exemplu.ro" required />
                </div>
                <div>
                  <label class="field-label" for="email-password">Confirmă cu parola</label>
                  <input id="email-password" class="input" type="password" value={emailPassword()} onInput={(event) => setEmailPassword(event.currentTarget.value)} autocomplete="current-password" required />
                </div>
                <div class="settings-actions"><button type="submit" class="btn btn-primary" disabled={changingEmail()}>{changingEmail() ? 'Se trimite…' : 'Trimite confirmarea'}</button></div>
              </form>
            </div>
          </Show>

          <Show when={activeTab() === 'sessions'}>
            <div class="settings-section">
              <h3>Sesiuni active</h3>
              <p class="settings-description">Poți avea cel mult 20 de sesiuni. Fiecare expiră după 24 de ore de inactivitate sau cel târziu după șapte zile. Nu stocăm adresa IP sau modelul dispozitivului.</p>

              <div class="sessions-toolbar">
                <span>{sessions().length} {sessions().length === 1 ? 'sesiune activă' : 'sesiuni active'}</span>
                <button type="button" class="btn btn-danger-ghost" onClick={handleOtherSessionsRevoke} disabled={loadingSessions() || sessions().length <= 1 || Boolean(revokingSession())}>
                  {revokingSession() === 'all' ? 'Se închid…' : 'Închide celelalte sesiuni'}
                </button>
              </div>

              <Show
                when={!loadingSessions()}
                fallback={<div class="sessions-loading" role="status"><span class="spinner" aria-hidden="true" /> Se încarcă sesiunile…</div>}
              >
                <div class="sessions-list">
                  <For each={sessions()}>
                    {(session) => (
                      <article class={`session-item ${session.current ? 'is-current' : ''}`}>
                        <span class="session-icon" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="3" stroke="currentColor" stroke-width="1.8" /><path d="M9 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></span>
                        <div class="session-copy">
                          <div class="session-title-row">
                            <strong>{session.current ? 'Sesiunea curentă' : 'Sesiune activă'}</strong>
                            <Show when={session.current}><span class="session-badge">Acest dispozitiv</span></Show>
                          </div>
                          <p>Activitate: <time datetime={session.last_seen_at}>{formatDate(session.last_seen_at)}</time></p>
                          <p>Creată: <time datetime={session.created_at}>{formatDate(session.created_at)}</time> · Expiră: <time datetime={session.expires_at}>{formatDate(session.expires_at)}</time></p>
                        </div>
                        <Show when={!session.current}>
                          <button type="button" class="btn btn-danger-ghost session-revoke" onClick={() => handleSessionRevoke(session)} disabled={Boolean(revokingSession())}>
                            {revokingSession() === session.id ? 'Se închide…' : 'Închide'}
                          </button>
                        </Show>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          <Show when={activeTab() === 'security'}>
            <div class="settings-section">
              <h3>Activitate de securitate</h3>
              <p class="settings-description">Acțiunile importante ale contului, fără adresă IP, model de dispozitiv sau alte date de localizare.</p>

              <div class="security-events-toolbar">
                <span>Istoric păstrat maximum {securityEventRetentionDays()} de zile</span>
                <button type="button" class="btn btn-secondary" onClick={loadSecurityEvents} disabled={loadingSecurityEvents()}>
                  {loadingSecurityEvents() ? 'Se actualizează…' : 'Actualizează'}
                </button>
              </div>

              <Show
                when={!loadingSecurityEvents()}
                fallback={<div class="sessions-loading" role="status"><span class="spinner" aria-hidden="true" /> Se încarcă activitatea…</div>}
              >
                <Show
                  when={securityEvents().length > 0}
                  fallback={<div class="security-events-empty"><strong>Nicio activitate înregistrată încă</strong><p>Evenimentele noi vor apărea aici după autentificări și schimbări de securitate.</p></div>}
                >
                  <ol class="security-events-list">
                    <For each={securityEvents()}>
                      {(event) => {
                        const copy = securityEventCopy(event.event_type);
                        return (
                          <li class="security-event-item">
                            <span class="security-event-marker" aria-hidden="true"><span /></span>
                            <div>
                              <strong>{copy[0]}</strong>
                              <p>{copy[1]}</p>
                              <time datetime={event.occurred_at}>{formatDate(event.occurred_at)}</time>
                            </div>
                          </li>
                        );
                      }}
                    </For>
                  </ol>
                </Show>
              </Show>
            </div>
          </Show>

          <Show when={activeTab() === 'data'}>
            <div class="settings-section">
              <h3>Datele și contul tău</h3>
              <p class="settings-description">Descarcă o copie structurată a datelor sau șterge definitiv contul. Ambele acțiuni cer parola actuală.</p>

              <div class="account-data-controls">
                <article class="account-data-card">
                  <div class="account-data-card-heading">
                    <span class="account-data-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
                    <div><h4>Descarcă datele</h4><p>Primești un fișier JSON cu profilul, conținutul, interacțiunile, mesajele, sesiunile și activitatea contului. Parolele și tokenurile nu sunt incluse.</p></div>
                  </div>
                  <form class="settings-form account-data-form" onSubmit={handleDataExport}>
                    <div>
                      <label class="field-label" for="export-account-password">Confirmă cu parola</label>
                      <input id="export-account-password" class="input" type="password" value={exportPassword()} onInput={(event) => setExportPassword(event.currentTarget.value)} autocomplete="current-password" aria-describedby="export-account-note" required />
                      <p id="export-account-note" class="field-note">Fișierul poate conține informații private. Păstrează-l într-un loc sigur.</p>
                    </div>
                    <div class="settings-actions"><button type="submit" class="btn btn-primary" disabled={exportingData()}>{exportingData() ? 'Se pregătește…' : 'Descarcă copia datelor'}</button></div>
                  </form>
                </article>

                <article class="account-data-card danger-zone">
                  <div class="account-data-card-heading">
                    <span class="account-data-icon danger" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 7h16m-10 4v6m4-6v6M9 7l1-3h4l1 3m3 0-1 14H7L6 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
                    <div><h4>Șterge definitiv contul</h4><p>Profilul, postările, comentariile, aprecierile, salvările, mesajele, sesiunile și fișierele asociate vor fi eliminate. Acțiunea nu poate fi anulată.</p></div>
                  </div>
                  <form class="settings-form account-data-form" onSubmit={handleAccountDeletion}>
                    <div>
                      <label class="field-label" for="delete-account-password">Parola actuală</label>
                      <input id="delete-account-password" class="input" type="password" value={deletePassword()} onInput={(event) => setDeletePassword(event.currentTarget.value)} autocomplete="current-password" required />
                    </div>
                    <div>
                      <label class="field-label" for="delete-account-confirmation">Scrie <code>STERGE CONTUL</code></label>
                      <input id="delete-account-confirmation" class="input confirmation-input" type="text" value={deleteConfirmation()} onInput={(event) => setDeleteConfirmation(event.currentTarget.value)} autocomplete="off" autocapitalize="characters" spellcheck={false} required />
                    </div>
                    <div class="settings-actions"><button type="submit" class="btn btn-danger" disabled={deletingAccount() || deleteConfirmation() !== 'STERGE CONTUL'}>{deletingAccount() ? 'Se șterge…' : 'Șterge definitiv contul'}</button></div>
                  </form>
                </article>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </section>
  );
}
