import { A, useLocation, useNavigate } from '@solidjs/router';
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { api } from '../api';
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
  const [unreadNotifications, setUnreadNotifications] = createSignal(0);
  let loadedForUser = null;

  const refreshUnreadNotifications = async () => {
    if (!auth.isAuthenticated()) {
      setUnreadNotifications(0);
      return;
    }
    try {
      const result = await api.getUnreadNotificationCount();
      setUnreadNotifications(Number(result.count) || 0);
    } catch (error) {
      if (error.status !== 401) console.error('Failed to refresh unread notifications:', error);
    }
  };

  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') void refreshUnreadNotifications();
  };

  createEffect(() => {
    const userId = auth.user()?.id || null;
    if (userId !== loadedForUser) {
      loadedForUser = userId;
      if (userId) void refreshUnreadNotifications();
      else setUnreadNotifications(0);
    }
  });

  onMount(() => {
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('media:notifications-changed', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    onCleanup(() => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('media:notifications-changed', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    });
  });

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
            <A href="/search" class={`nav-link ${location.pathname === '/search' ? 'is-active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" />
                <path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
              Caută
            </A>
            <A href="/salvate" class={`nav-link ${location.pathname === '/salvate' ? 'is-active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
              </svg>
              Salvate
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

        <Show when={!auth.isAuthenticated() && !auth.loading()}>
          <div class="nav-links public-nav-links">
            <A href="/despre" class={`nav-link ${location.pathname === '/despre' ? 'is-active' : ''}`}>Despre</A>
            <A href="/reguli" class={`nav-link ${location.pathname === '/reguli' ? 'is-active' : ''}`}>Reguli</A>
          </div>
        </Show>

        <div class="nav-actions">
          <Show when={auth.isAuthenticated()}>
            <A
              href="/notificari"
              class={`icon-button notification-nav-button ${location.pathname === '/notificari' ? 'is-active' : ''}`}
              aria-label={unreadNotifications() > 0 ? `${unreadNotifications()} notificări necitite` : 'Notificări'}
              title="Notificări"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM9.8 21h4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <Show when={unreadNotifications() > 0}>
                <span class="notification-nav-badge" aria-hidden="true">{unreadNotifications() > 99 ? '99+' : unreadNotifications()}</span>
              </Show>
            </A>
          </Show>
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
          <A href="/search" class={location.pathname === '/search' ? 'is-active' : ''}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" />
              <path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
            <span>Caută</span>
          </A>
          <button type="button" class="mobile-compose" onClick={handleCompose}>
            <span class="mobile-compose-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
            </span>
            <span>Publică</span>
          </button>
          <A href="/salvate" class={location.pathname === '/salvate' ? 'is-active' : ''}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            </svg>
            <span>Salvate</span>
          </A>
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
