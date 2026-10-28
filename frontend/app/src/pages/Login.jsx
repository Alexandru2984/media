import { A, useNavigate } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';

function SubmitSpinner() {
  return (
    <svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".25" stroke-width="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const navigate = useNavigate();
  const auth = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await auth.login(email().trim(), password());
      navigate('/');
    } catch (requestError) {
      console.error('Login failed:', requestError);
      setError('Datele de conectare nu sunt corecte. Verifică emailul și parola.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageMeta title="Conectare — Media" description="Conectează-te în contul tău Media." canonicalPath="/login" noIndex />
      <Navbar />
      <main class="auth-page">
        <div class="auth-layout app-container">
          <section class="auth-intro" aria-labelledby="login-intro-title">
            <div class="eyebrow">Bine ai revenit</div>
            <h1 id="login-intro-title">Conversațiile tale continuă aici.</h1>
            <p>Intră în cont pentru a vedea cele mai noi postări, a răspunde comunității și a publica următoarea ta idee.</p>
          </section>

          <section class="surface auth-card" aria-labelledby="login-title">
            <header class="auth-card-header">
              <h1 id="login-title">Conectare</h1>
              <p>Folosește adresa de email asociată contului tău.</p>
            </header>

            <Show when={error()}>
              <div class="alert alert-error" role="alert" style={{ 'margin-bottom': '18px' }}>{error()}</div>
            </Show>

            <form class="auth-form" onSubmit={handleSubmit}>
              <div>
                <label class="field-label" for="login-email">Adresă de email</label>
                <input
                  id="login-email"
                  class="input"
                  type="email"
                  value={email()}
                  onInput={(event) => setEmail(event.currentTarget.value)}
                  autocomplete="email"
                  inputmode="email"
                  placeholder="nume@exemplu.ro"
                  required
                />
              </div>

              <div>
                <label class="field-label" for="login-password">Parolă</label>
                <input
                  id="login-password"
                  class="input"
                  type="password"
                  value={password()}
                  onInput={(event) => setPassword(event.currentTarget.value)}
                  autocomplete="current-password"
                  placeholder="Parola ta"
                  required
                />
              </div>

              <div class="auth-row">
                <A href="/forgot-password" class="text-link">Ai uitat parola?</A>
              </div>

              <button type="submit" class="btn btn-primary" disabled={submitting()}>
                <Show when={submitting()} fallback="Intră în cont">
                  <SubmitSpinner /> Se conectează…
                </Show>
              </button>
            </form>

            <p class="auth-footer">
              Nu ai cont? <A href="/register" class="text-link">Creează unul gratuit</A>
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
