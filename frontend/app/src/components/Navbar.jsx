import { A, useLocation, useNavigate } from '@solidjs/router';
import { Show } from 'solid-js';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import { getImageUrl } from '../utils/urls';

function BrandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 8.5h10M7 12h6M9 19l-4 2v-5.2A7 7 0 0 1 3 11C3 6.6 7 3 12 3s9 3.6 9 8-4 8-9 8H9Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function ThemeIcon(props) {
  return props.dark ? (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" />
    </svg>
  ) : (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
    </svg>
  );
}

export default function Navbar() {
  const auth = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await auth.logout();
    navigate('/');
  };

  const handleCompose = () => {
    if (location.pathname !== '/') navigate('/');
    window.setTimeout(() => {
      document.getElementById('new-post-content')?.focus();
    }, 100);
  };

  return (
    <>
      <header class="site-header">
        <nav class="site-nav app-container" aria-label="Navigație principală">
        <A href="/" class="brand" aria-label="Media — pagina principală">
          <span class="brand-mark"><BrandIcon /></span>
          <span class="brand-name">Media</span>
        </A>

        <Show when={auth.isAuthenticated()}>
          <div class="nav-links">
            <A href="/" class={`nav-link ${location.pathname === '/' ? 'is-active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
              </svg>
              Acasă
            </A>
            <A href={`/profile/${auth.user()?.id}`} class={`nav-link ${location.pathname.startsWith('/profile/') ? 'is-active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8" />
                <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
              Profil
            </A>
          </div>
        </Show>

        <div class="nav-actions">
          <button
            type="button"
            class="icon-button"
            onClick={toggleTheme}
            aria-label={theme() === 'light' ? 'Activează tema întunecată' : 'Activează tema luminoasă'}
            title={theme() === 'light' ? 'Temă întunecată' : 'Temă luminoasă'}
          >
            <ThemeIcon dark={theme() === 'dark'} />
          </button>

          <Show
            when={auth.isAuthenticated()}
            fallback={
              <Show when={!auth.loading()}>
                <A href="/login" class="btn btn-ghost desktop-only">Conectare</A>
                <A href="/register" class="btn btn-primary">Cont nou</A>
              </Show>
            }
          >
            <A href={`/profile/${auth.user()?.id}`} class="nav-user" aria-label="Deschide profilul">
              <Show
                when={auth.user()?.avatar_url}
                fallback={<span class="avatar-fallback">{auth.user()?.username?.charAt(0).toUpperCase()}</span>}
              >
                <img class="avatar" src={getImageUrl(auth.user()?.avatar_url)} alt="" />
              </Show>
              <span>{auth.user()?.username}</span>
            </A>
            <button type="button" class="btn btn-secondary desktop-only" onClick={handleLogout}>
              Ieșire
            </button>
            <button type="button" class="icon-button" onClick={handleLogout} aria-label="Deconectare" title="Deconectare">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5m5-3 4-4-4-4m4 4H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </Show>
        </div>
        </nav>
      </header>

      <Show when={auth.isAuthenticated()}>
        <nav class="mobile-bottom-nav" aria-label="Navigație mobilă">
          <A href="/" class={location.pathname === '/' ? 'is-active' : ''}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            </svg>
            <span>Acasă</span>
          </A>
          <button type="button" class="mobile-compose" onClick={handleCompose}>
            <span class="mobile-compose-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
            </span>
            <span>Publică</span>
          </button>
          <A href={`/profile/${auth.user()?.id}`} class={location.pathname.startsWith('/profile/') ? 'is-active' : ''}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8" />
              <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <span>Profil</span>
          </A>
        </nav>
      </Show>
    </>
  );
}
