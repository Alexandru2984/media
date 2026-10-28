import { A, useNavigate } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';

export default function Register() {
  const [username, setUsername] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [bio, setBio] = createSignal('');
  const [error, setError] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const navigate = useNavigate();
  const auth = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (password().length < 6) {
      setError('Parola trebuie să conțină cel puțin 6 caractere.');
      return;
    }

    setSubmitting(true);
    try {
      await auth.register(username().trim(), email().trim(), password(), bio().trim());
      navigate('/');
    } catch (requestError) {
      console.error('Registration failed:', requestError);
      setError('Contul nu a putut fi creat. Emailul sau numele de utilizator poate fi deja folosit.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main class="auth-page">
        <div class="auth-layout app-container">
          <section class="auth-intro" aria-labelledby="register-intro-title">
            <div class="eyebrow">Intră în comunitate</div>
            <h1 id="register-intro-title">Un loc simplu pentru idei bune.</h1>
            <p>Creează-ți profilul, publică momentele importante și descoperă ce au de spus oamenii din jurul tău.</p>
          </section>

          <section class="surface auth-card" aria-labelledby="register-title">
            <header class="auth-card-header">
              <h1 id="register-title">Creează un cont</h1>
              <p>Durează mai puțin de un minut.</p>
            </header>

            <Show when={error()}>
              <div class="alert alert-error" role="alert" style={{ 'margin-bottom': '18px' }}>{error()}</div>
            </Show>

            <form class="auth-form" onSubmit={handleSubmit}>
              <div>
                <label class="field-label" for="register-username">Nume de utilizator</label>
                <input
                  id="register-username"
                  class="input"
                  type="text"
                  value={username()}
                  onInput={(event) => setUsername(event.currentTarget.value)}
                  autocomplete="username"
                  placeholder="Cum vrei să apari?"
                  minlength="2"
                  maxlength="32"
                  required
                />
              </div>

              <div>
                <label class="field-label" for="register-email">Adresă de email</label>
                <input
                  id="register-email"
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
                <label class="field-label" for="register-password">Parolă</label>
                <input
                  id="register-password"
                  class="input"
                  type="password"
                  value={password()}
                  onInput={(event) => setPassword(event.currentTarget.value)}
                  autocomplete="new-password"
                  placeholder="Alege o parolă"
                  minlength="6"
                  required
                />
                <p class="password-hint">Folosește cel puțin 6 caractere și evită parolele reutilizate.</p>
              </div>

              <div>
                <label class="field-label" for="register-bio">Despre tine <span style={{ 'font-weight': '500' }}>(opțional)</span></label>
                <textarea
                  id="register-bio"
                  class="textarea"
                  value={bio()}
                  onInput={(event) => setBio(event.currentTarget.value)}
                  rows="3"
                  maxlength="240"
                  placeholder="Câteva cuvinte despre tine…"
                />
              </div>

              <button type="submit" class="btn btn-primary" disabled={submitting()}>
                <Show
                  when={submitting()}
                  fallback="Creează contul"
                >
                  <svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".25" stroke-width="3" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                  </svg>
                  Se creează…
                </Show>
              </button>
            </form>

            <p class="auth-footer">
              Ai deja cont? <A href="/login" class="text-link">Conectează-te</A>
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
