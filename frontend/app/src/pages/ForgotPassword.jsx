import { A } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { api } from '../api';
import AccountFlow, { StatusMark } from '../components/AccountFlow';
import PageMeta from '../components/PageMeta';

export default function ForgotPassword() {
  const [email, setEmail] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [sent, setSent] = createSignal(false);
  const [error, setError] = createSignal('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(email().trim());
      setSent(true);
    } catch (requestError) {
      console.error('Password reset request failed:', requestError);
      setError('Solicitarea nu a putut fi procesată. Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccountFlow>
      <PageMeta title="Recuperează parola — Media" description="Solicită un link securizat pentru resetarea parolei Media." canonicalPath="/forgot-password" noIndex />
      <Show
        when={!sent()}
        fallback={
          <div class="account-status">
            <StatusMark tone="success">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </StatusMark>
            <h1>Verifică-ți inboxul</h1>
            <p>Dacă există un cont pentru această adresă, vei primi instrucțiunile de resetare în următoarele minute.</p>
            <A href="/login" class="btn btn-primary">Înapoi la conectare</A>
          </div>
        }
      >
        <header class="account-flow-header">
          <StatusMark tone="info">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.8" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.8" /></svg>
          </StatusMark>
          <h1>Ai uitat parola?</h1>
          <p>Introdu adresa contului și îți trimitem un link valabil timp de o oră.</p>
        </header>

        <Show when={error()}><div class="alert alert-error" role="alert">{error()}</div></Show>

        <form class="account-flow-form" onSubmit={handleSubmit}>
          <div>
            <label class="field-label" for="recovery-email">Adresă de email</label>
            <input id="recovery-email" class="input" type="email" value={email()} onInput={(event) => setEmail(event.currentTarget.value)} autocomplete="email" inputmode="email" placeholder="nume@exemplu.ro" required />
          </div>
          <button type="submit" class="btn btn-primary" disabled={loading()}>{loading() ? 'Se trimite…' : 'Trimite linkul de resetare'}</button>
        </form>
        <p class="account-flow-footer"><A href="/login" class="text-link">Înapoi la conectare</A></p>
      </Show>
    </AccountFlow>
  );
}
