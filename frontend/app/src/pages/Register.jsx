import { createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useAuth } from '../AuthContext';

export default function Register() {
  const [username, setUsername] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [bio, setBio] = createSignal('');
  const [error, setError] = createSignal('');
  const navigate = useNavigate();
  const auth = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password().length < 6) {
      setError('Parola trebuie să aibă minim 6 caractere');
      return;
    }

    try {
      await auth.register(username(), email(), password(), bio());
      navigate('/');
    } catch (err) {
      setError('Înregistrarea a eșuat. Este posibil ca email-ul sau username-ul să fie deja folosit.');
    }
  };

  return (
    <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-md w-full space-y-8">
        {/* Header */}
        <div class="text-center">
          <div class="flex justify-center mb-4">
            <span class="text-6xl">🚀</span>
          </div>
          <h2 class="text-4xl font-bold bg-gradient-to-r from-primary-500 to-blue-600 bg-clip-text text-transparent mb-2">
            Alătură-te comunității!
          </h2>
          <p class="text-gray-600 dark:text-gray-400">
            Creează-ți contul gratuit
          </p>
        </div>

        {/* Card */}
        <div class="card p-8">
          {error() && (
            <div class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p class="text-red-600 dark:text-red-400 text-sm text-center font-medium">
                {error()}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} class="space-y-5">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username()}
                onInput={(e) => setUsername(e.target.value)}
                required
                class="input"
                placeholder="alexcool123"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email()}
                onInput={(e) => setEmail(e.target.value)}
                required
                class="input"
                placeholder="nume@exemplu.com"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Parolă
              </label>
              <input
                type="password"
                value={password()}
                onInput={(e) => setPassword(e.target.value)}
                required
                minLength="6"
                class="input"
                placeholder="Minim 6 caractere"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Bio (opțional)
              </label>
              <textarea
                value={bio()}
                onInput={(e) => setBio(e.target.value)}
                rows="3"
                class="textarea"
                placeholder="Spune-ne despre tine..."
              />
            </div>

            <button
              type="submit"
              disabled={auth.loading()}
              class="btn btn-primary w-full text-base py-3 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {auth.loading() ? (
                <span class="flex items-center justify-center">
                  <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Se încarcă...
                </span>
              ) : (
                'Creează cont'
              )}
            </button>
          </form>

          <div class="mt-6 text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Ai deja cont?{' '}
              <a
                href="/login"
                class="font-semibold text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
              >
                Conectează-te aici
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}