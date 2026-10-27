import { createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useAuth } from '../AuthContext';

export default function Login() {
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const navigate = useNavigate();
  const auth = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await auth.login(email(), password());
      navigate('/');
    } catch (err) {
      setError('Email sau parolă incorectă');
    }
  };

  return (
    <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-md w-full space-y-8">
        {/* Header */}
        <div class="text-center">
          <div class="flex justify-center mb-4">
            <span class="text-6xl">🌐</span>
          </div>
          <h2 class="text-4xl font-bold bg-gradient-to-r from-primary-500 to-blue-600 bg-clip-text text-transparent mb-2">
            Bun venit înapoi!
          </h2>
          <p class="text-gray-600 dark:text-gray-400">
            Conectează-te pentru a continua
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

          <form onSubmit={handleSubmit} class="space-y-6">
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
                class="input"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={auth.loading()}
              class="btn btn-primary w-full text-base py-3 disabled:opacity-50 disabled:cursor-not-allowed"
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
                'Conectare'
              )}
            </button>
          </form>

          <div class="mt-4 text-center">
            <a
              href="/forgot-password"
              class="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
            >
              Ai uitat parola?
            </a>
          </div>

          <div class="mt-6 text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Nu ai cont?{' '}
              <a
                href="/register"
                class="font-semibold text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
              >
                Înregistrează-te aici
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}