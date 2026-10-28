import { createSignal, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { getImageUrl } from '../utils/urls';
import { getPasswordPolicyError } from '../utils/passwords';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
  const [message, setMessage] = createSignal({ type: '', text: '' });
  let avatarInput;
  let messageTimeout;

  const showMessage = (type, text) => {
    window.clearTimeout(messageTimeout);
    setMessage({ type, text });
    messageTimeout = window.setTimeout(() => setMessage({ type: '', text: '' }), 6000);
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
      showMessage('success', 'Am trimis confirmarea la noua adresă. Linkul este valabil 24 de ore.');
    } catch (requestError) {
      console.error('Failed to change email:', requestError);
      showMessage('error', 'Adresa nu a putut fi schimbată. Verifică parola și adresa introdusă.');
    } finally {
      setChangingEmail(false);
    }
  };

  return (
    <section class="settings-layout" aria-labelledby="account-settings-title">
      <header class="settings-heading">
        <div>
          <p class="sidebar-eyebrow">Contul tău</p>
          <h2 id="account-settings-title">Setări și securitate</h2>
          <p>Administrează identitatea și datele de acces ale contului.</p>
        </div>
      </header>

      <div class="settings-grid">
        <div class="settings-nav surface" role="tablist" aria-label="Categorii de setări">
          <button type="button" role="tab" aria-selected={activeTab() === 'avatar'} class={activeTab() === 'avatar' ? 'is-active' : ''} onClick={() => setActiveTab('avatar')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8" /><path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" /></svg>
            <span><strong>Avatar</strong><small>Poza profilului</small></span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab() === 'password'} class={activeTab() === 'password' ? 'is-active' : ''} onClick={() => setActiveTab('password')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.8" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
            <span><strong>Parolă</strong><small>Protecția contului</small></span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab() === 'email'} class={activeTab() === 'email' ? 'is-active' : ''} onClick={() => setActiveTab('email')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8" /><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
            <span><strong>Email</strong><small>Adresa de conectare</small></span>
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
                  <input id="new-email" class="input" type="email" value={newEmail()} onInput={(event) => setNewEmail(event.currentTarget.value)} autocomplete="email" maxlength="206" placeholder="nume@exemplu.ro" required />
                </div>
                <div>
                  <label class="field-label" for="email-password">Confirmă cu parola</label>
                  <input id="email-password" class="input" type="password" value={emailPassword()} onInput={(event) => setEmailPassword(event.currentTarget.value)} autocomplete="current-password" required />
                </div>
                <div class="settings-actions"><button type="submit" class="btn btn-primary" disabled={changingEmail()}>{changingEmail() ? 'Se trimite…' : 'Trimite confirmarea'}</button></div>
              </form>
            </div>
          </Show>
        </div>
      </div>
    </section>
  );
}
