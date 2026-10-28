import { A, useNavigate, useSearchParams } from '@solidjs/router';
import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { api } from '../api';
import AccountFlow, { StatusMark } from '../components/AccountFlow';
import PageMeta from '../components/PageMeta';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = createSignal('loading');
  const [message, setMessage] = createSignal('Confirmăm adresa ta de email…');
  let redirectTimer;
  onCleanup(() => window.clearTimeout(redirectTimer));

  onMount(async () => {
    const token = searchParams.token;
    if (!token) {
      setStatus('error');
      setMessage('Linkul de verificare este incomplet.');
      return;
    }

    try {
      await api.verifyEmail(token);
      setStatus('success');
      setMessage('Adresa a fost confirmată. Contul tău este pregătit.');
      redirectTimer = window.setTimeout(() => navigate('/'), 2200);
    } catch (requestError) {
      console.error('Email verification failed:', requestError);
      setStatus('error');
      setMessage('Linkul este invalid, a expirat sau a fost deja folosit.');
    }
  });

  return (
    <AccountFlow>
      <PageMeta title="Verifică adresa de email — Media" description="Confirmă adresa asociată contului Media." canonicalPath="/verify-email" noIndex />
      <div class="account-status">
        <Show when={status() === 'loading'}>
          <StatusMark tone="info"><svg class="spinner" width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".25" stroke-width="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg></StatusMark>
          <h1>Se verifică adresa</h1>
        </Show>
        <Show when={status() === 'success'}>
          <StatusMark tone="success"><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></StatusMark>
          <h1>Email verificat</h1>
        </Show>
        <Show when={status() === 'error'}>
          <StatusMark tone="error"><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></StatusMark>
          <h1>Verificarea nu a reușit</h1>
        </Show>
        <p>{message()}</p>
        <Show when={status() !== 'loading'}><A href="/" class="btn btn-primary">Înapoi la Media</A></Show>
      </div>
    </AccountFlow>
  );
}
