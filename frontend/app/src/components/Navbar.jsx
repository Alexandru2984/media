import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import { useNavigate } from '@solidjs/router';
import { Show } from 'solid-js';
import { getImageUrl } from '../utils/urls';

export default function Navbar() {
  const auth = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    auth.logout();
    navigate('/login');
  };

  return (
    <nav class="bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 transition-colors">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          {/* Logo */}
          <div
            class="flex items-center space-x-2 cursor-pointer group"
            onClick={() => navigate('/')}
          >
            <span class="text-3xl">🌐</span>
            <h1 class="text-2xl font-bold bg-gradient-to-r from-primary-500 to-blue-600 bg-clip-text text-transparent group-hover:from-primary-600 group-hover:to-blue-700 transition-all">
              Social Media
            </h1>
          </div>

          {/* Right side - Auth actions */}
          <div class="flex items-center space-x-4">
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              class="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Toggle dark mode"
            >
              {theme() === 'light' ? (
                <span class="text-xl">🌙</span>
              ) : (
                <span class="text-xl">☀️</span>
              )}
            </button>

            {auth.isAuthenticated() && (
              <>
                {/* User Profile Link */}
                <button
                  onClick={() => navigate(`/profile/${auth.user()?.id}`)}
                  class="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                >
                  <Show
                    when={auth.user()?.avatar_url}
                    fallback={
                      <span class="text-xl">👤</span>
                    }
                  >
                    <img
                      src={getImageUrl(auth.user()?.avatar_url)}
                      alt={auth.user()?.username}
                      class="w-8 h-8 rounded-full object-cover border-2 border-primary-500"
                    />
                  </Show>
                  <span class="font-medium text-gray-700 dark:text-gray-200 hidden sm:inline">
                    {auth.user()?.username}
                  </span>
                </button>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  class="btn btn-primary text-sm"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}