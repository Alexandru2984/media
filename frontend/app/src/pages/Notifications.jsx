import { A, useNavigate } from '@solidjs/router';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Navbar from '../components/Navbar';
import PageMeta from '../components/PageMeta';
import { getImageUrl } from '../utils/urls';

const PAGE_SIZE = 20;

const notificationCopy = {
  follow_request: 'ți-a trimis o cerere de urmărire',
  follow_accepted: 'ți-a acceptat cererea de urmărire',
  new_follower: 'a început să te urmărească',
  post_like: 'a apreciat postarea ta',
  post_comment: 'a comentat la postarea ta',
};

const dateFormatter = new Intl.DateTimeFormat('ro-RO', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function announceNotificationChange() {
  window.dispatchEvent(new CustomEvent('media:notifications-changed'));
}

function notificationDestination(notification, currentUserId) {
  if (notification.kind === 'follow_request') return '/cereri';
  if (notification.kind === 'post_like' || notification.kind === 'post_comment') {
    return `/profile/${currentUserId}`;
  }
  return `/profile/${notification.actor.id}`;
}

export default function Notifications() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = createSignal([]);
  const [loading, setLoading] = createSignal(true);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(true);
  const [pendingAction, setPendingAction] = createSignal('');
  const [error, setError] = createSignal('');
  const [loadedForUser, setLoadedForUser] = createSignal(null);

  const loadNotifications = async ({ append = false } = {}) => {
    if (append && (loadingMore() || !hasMore())) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');

    try {
      const data = await api.getNotifications(
        PAGE_SIZE,
        append ? notifications().length : 0,
      );
      setNotifications((current) => append ? [...current, ...data] : data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (requestError) {
      console.error('Failed to load notifications:', requestError);
      setError('Notificările nu au putut fi încărcate. Încearcă din nou.');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const markRead = async (notification) => {
    if (notification.is_read || pendingAction()) return;
    setPendingAction(`read:${notification.id}`);
    setError('');
    try {
      await api.markNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )));
      announceNotificationChange();
    } catch (requestError) {
      console.error('Failed to mark notification read:', requestError);
      if (requestError.status === 404) {
        setNotifications((current) => current.filter((item) => item.id !== notification.id));
        announceNotificationChange();
      } else {
        setError('Notificarea nu a putut fi actualizată.');
      }
    } finally {
      setPendingAction('');
    }
  };

  const markAllRead = async () => {
    if (pendingAction() || !notifications().some((item) => !item.is_read)) return;
    setPendingAction('read-all');
    setError('');
    try {
      await api.markAllNotificationsRead();
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      announceNotificationChange();
    } catch (requestError) {
      console.error('Failed to mark all notifications read:', requestError);
      setError('Notificările nu au putut fi marcate drept citite.');
    } finally {
      setPendingAction('');
    }
  };

  const dismissNotification = async (notification) => {
    if (pendingAction()) return;
    setPendingAction(`delete:${notification.id}`);
    setError('');
    try {
      await api.deleteNotification(notification.id);
      setNotifications((current) => current.filter((item) => item.id !== notification.id));
      announceNotificationChange();
    } catch (requestError) {
      console.error('Failed to dismiss notification:', requestError);
      if (requestError.status === 404) {
        setNotifications((current) => current.filter((item) => item.id !== notification.id));
        announceNotificationChange();
      } else {
        setError('Notificarea nu a putut fi ștearsă.');
      }
    } finally {
      setPendingAction('');
    }
  };

  createEffect(() => {
    if (auth.loading()) return;
    if (!auth.isAuthenticated()) {
      navigate('/login');
      return;
    }

    const userId = auth.user()?.id;
    if (userId && loadedForUser() !== userId) {
      setLoadedForUser(userId);
      void loadNotifications();
    }
  });

  return (
    <>
      <PageMeta
        title="Notificări — Media"
        description="Activitatea recentă a contului tău Media."
        canonicalPath="/notificari"
        noIndex
      />
      <Navbar />
      <main class="notifications-page app-container">
        <header class="notifications-hero">
          <span class="notifications-hero-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM9.8 21h4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <div class="notifications-hero-copy">
            <p class="sidebar-eyebrow">Activitatea ta</p>
            <h1>Notificări</h1>
            <p>Aprecieri, comentarii și actualizări despre persoanele cu care te conectezi.</p>
          </div>
          <Show when={notifications().some((item) => !item.is_read)}>
            <button
              type="button"
              class="btn btn-secondary notifications-read-all"
              onClick={markAllRead}
              disabled={Boolean(pendingAction())}
            >
              {pendingAction() === 'read-all' ? 'Se actualizează…' : 'Marchează toate ca citite'}
            </button>
          </Show>
        </header>

        <Show when={error()}><p class="alert alert-error notifications-alert" role="alert">{error()}</p></Show>

        <Show
          when={!loading()}
          fallback={<div class="surface skeleton"><div class="skeleton-lines"><div class="skeleton-line" /><div class="skeleton-line" /><div class="skeleton-line" /></div></div>}
        >
          <Show
            when={notifications().length > 0}
            fallback={
              <Show when={!error()}>
                <div class="surface state-card">
                  <div>
                    <span class="state-icon"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21a9 9 0 1 0-9-9m5 0 2.5 2.5L16 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
                    <h2>Ești la zi</h2>
                    <p>Interacțiunile noi vor apărea aici, fără să depindă de email.</p>
                  </div>
                </div>
              </Show>
            }
          >
            <div class="notifications-list">
              <For each={notifications()}>
                {(notification) => (
                  <article class={`surface notification-card ${notification.is_read ? '' : 'is-unread'}`}>
                    <Show when={!notification.is_read}><span class="notification-unread-dot" aria-label="Necitită" /></Show>
                    <A
                      href={`/profile/${notification.actor.id}`}
                      class="notification-avatar-link"
                      onClick={() => void markRead(notification)}
                      aria-label={`Deschide profilul ${notification.actor.username}`}
                    >
                      <Show
                        when={notification.actor.avatar_url}
                        fallback={<span class="notification-avatar avatar-fallback">{notification.actor.username.charAt(0).toUpperCase()}</span>}
                      >
                        <img class="notification-avatar avatar" src={getImageUrl(notification.actor.avatar_url)} alt="" loading="lazy" decoding="async" />
                      </Show>
                    </A>
                    <div class="notification-copy">
                      <p><A href={`/profile/${notification.actor.id}`} onClick={() => void markRead(notification)}>{notification.actor.username}</A> {notificationCopy[notification.kind] || 'are o actualizare pentru tine'}.</p>
                      <time datetime={notification.created_at}>{dateFormatter.format(new Date(notification.created_at))}</time>
                    </div>
                    <div class="notification-actions">
                      <A
                        href={notificationDestination(notification, auth.user()?.id)}
                        class="btn btn-ghost"
                        onClick={() => void markRead(notification)}
                      >
                        {notification.kind === 'follow_request' ? 'Administrează' : 'Vezi'}
                      </A>
                      <Show when={!notification.is_read}>
                        <button type="button" class="icon-button" onClick={() => markRead(notification)} disabled={Boolean(pendingAction())} aria-label="Marchează drept citită" title="Marchează drept citită">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>
                        </button>
                      </Show>
                      <button type="button" class="icon-button notification-dismiss" onClick={() => dismissNotification(notification)} disabled={Boolean(pendingAction())} aria-label="Șterge notificarea" title="Șterge notificarea">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
                      </button>
                    </div>
                  </article>
                )}
              </For>
            </div>
            <Show when={hasMore()}>
              <div class="feed-pagination"><button type="button" class="btn btn-secondary" onClick={() => loadNotifications({ append: true })} disabled={loadingMore()}>{loadingMore() ? 'Se încarcă…' : 'Încarcă mai multe'}</button></div>
            </Show>
          </Show>
        </Show>
      </main>
    </>
  );
}
