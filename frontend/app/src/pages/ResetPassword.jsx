import { A, useNavigate } from '@solidjs/router';
import { createSignal, onCleanup, Show } from 'solid-js';
import { api } from '../api';
import AccountFlow, { StatusMark } from '../components/AccountFlow';
import { getPasswordPolicyError } from '../utils/passwords';
import PageMeta from '../components/PageMeta';
import { consumeOneTimeToken } from '../utils/urls';

export default function ResetPassword() {
  const navigate = useNavigate();
  const token = consumeOneTimeToken();
  const [password, setPassword] = createSignal('');
  const [confirmPassword, setConfirmPassword] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  const [success, setSuccess] = createSignal(false);
  let redirectTimer;
  onCleanup(() => window.clearTimeout(redirectTimer));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password() !== confirmPassword()) {
      setError('Parolele introduse nu se potrivesc.');
      return;
    }
    const policyError = getPasswordPolicyError(password());
    if (policyError) {
      setError(policyError);
      return;
    }
    if (!token) {
      setError('Linkul de resetare este incomplet. Solicită unul nou.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password());
      setSuccess(true);
      redirectTimer = window.setTimeout(() => navigate('/login'), 2500);
    } catch (requestError) {
      console.error('Password reset failed:', requestError);
      setError('Linkul este invalid sau a expirat. Solicită un link nou.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccountFlow>
      <PageMeta title="Alege o parolă nouă — Media" description="Setează o parolă nouă pentru contul Media." canonicalPath="/reset-password" noIndex />
      <Show
        when={!success()}
        fallback={
          <div class="account-status">
            <StatusMark tone="success"><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></StatusMark>
            <h1>Parolă actualizată</h1>
            <p>Poți folosi noua parolă la următoarea conectare. Te redirecționăm acum.</p>
            <A href="/login" class="btn btn-primary">Mergi la conectare</A>
          </div>
        }
      >
        <header class="account-flow-header">
          <StatusMark tone="info"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 15v2m-6-7V7a6 6 0 0 1 12 0v3M5 10h14a2 2 0 0 1 2 2v8H3v-8a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></StatusMark>
          <h1>Alege o parolă nouă</h1>
          <p>Folosește între 12 și 72 de caractere și nu reutiliza o parolă de pe alt site.</p>
        </header>

        <Show when={error()}><div class="alert alert-error" role="alert">{error()}</div></Show>

        <form class="account-flow-form" onSubmit={handleSubmit}>
          <div>
            <label class="field-label" for="reset-password">Parola nouă</label>
            <input id="reset-password" class="input" type="password" value={password()} onInput={(event) => setPassword(event.currentTarget.value)} autocomplete="new-password" minlength="12" maxlength="72" required />
          </div>
          <div>
            <label class="field-label" for="reset-password-confirmation">Confirmă parola</label>
            <input id="reset-password-confirmation" class="input" type="password" value={confirmPassword()} onInput={(event) => setConfirmPassword(event.currentTarget.value)} autocomplete="new-password" minlength="12" maxlength="72" required />
          </div>
          <button type="submit" class="btn btn-primary" disabled={loading()}>{loading() ? 'Se salvează…' : 'Salvează parola'}</button>
        </form>
        <p class="account-flow-footer"><A href="/forgot-password" class="text-link">Solicită alt link</A></p>
      </Show>
    </AccountFlow>
  );
}
