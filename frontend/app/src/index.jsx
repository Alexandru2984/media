/* @refresh reload */
import { createSignal, ErrorBoundary, lazy, onCleanup, onMount, Show, Suspense } from 'solid-js';
import { render } from 'solid-js/web';
import { Router, Route } from '@solidjs/router';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import Home from './pages/Home';
import './index.css';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Profile = lazy(() => import('./pages/Profile'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmailChange = lazy(() => import('./pages/VerifyEmailChange'));
const Search = lazy(() => import('./pages/Search'));
const About = lazy(() => import('./pages/About'));
const CommunityGuidelines = lazy(() => import('./pages/CommunityGuidelines'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const Help = lazy(() => import('./pages/Help'));
const SavedPosts = lazy(() => import('./pages/SavedPosts'));
const Connections = lazy(() => import('./pages/Connections'));
const FollowRequests = lazy(() => import('./pages/FollowRequests'));
const Notifications = lazy(() => import('./pages/Notifications'));
const SafetyCenter = lazy(() => import('./pages/SafetyCenter'));
const Moderation = lazy(() => import('./pages/Moderation'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RouteLoading() {
  return (
    <main id="route-content" class="route-loading" role="status" aria-live="polite" aria-busy="true" tabindex="-1">
      <svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.24" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <span>Se încarcă pagina…</span>
    </main>
  );
}

function RouteFailure() {
  let recoveryPage;
  const reload = () => window.location.reload();

  onMount(() => recoveryPage?.focus({ preventScroll: true }));

  return (
    <main ref={recoveryPage} id="route-content" class="route-error" tabindex="-1">
      <section class="surface route-error-card" role="alert" aria-labelledby="route-error-title">
        <span class="route-error-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 8v5m0 3.5v.01M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.6L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <p class="sidebar-eyebrow">Recuperare sigură</p>
        <h1 id="route-error-title">Pagina nu s-a putut încărca.</h1>
        <p>Conexiunea poate fi întreruptă sau aplicația tocmai a primit o actualizare. Datele introduse nu au fost trimise din nou.</p>
        <div class="route-error-actions">
          <button type="button" class="btn btn-primary" onClick={reload}>Reîncarcă pagina</button>
          <a href="/" class="btn btn-secondary">Înapoi la Media</a>
        </div>
      </section>
    </main>
  );
}

function ConnectionStatus() {
  const [offline, setOffline] = createSignal(typeof navigator !== 'undefined' && !navigator.onLine);

  onMount(() => {
    const markOffline = () => setOffline(true);
    const markOnline = () => setOffline(false);
    window.addEventListener('offline', markOffline);
    window.addEventListener('online', markOnline);
    onCleanup(() => {
      window.removeEventListener('offline', markOffline);
      window.removeEventListener('online', markOnline);
    });
  });

  return (
    <Show when={offline()}>
      <aside class="connection-banner" role="status" aria-live="polite">
        <span aria-hidden="true" />
        <strong>Ești offline.</strong>
        <span>Unele acțiuni vor funcționa după reconectare.</span>
      </aside>
    </Show>
  );
}

function RouteRoot(props) {
  return (
    <>
      <a class="skip-link" href="#route-content">Sari la conținut</a>
      <ConnectionStatus />
      <ErrorBoundary fallback={() => <RouteFailure />}>
        <Suspense fallback={<RouteLoading />}>
          <div id="route-content" class="route-content" tabindex="-1">{props.children}</div>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

const root = document.getElementById('root');

// Public editorial routes ship useful crawlable HTML. The interactive client
// replaces that build-time snapshot instead of duplicating it after hydration.
root.replaceChildren();

render(
  () => (
    <ThemeProvider>
      <AuthProvider>
        <Router root={RouteRoot}>
          <Route path="/" component={Home} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/profile/:id" component={Profile} />
          <Route path="/profile/:id/urmaritori" component={Connections} />
          <Route path="/profile/:id/urmariri" component={Connections} />
          <Route path="/cereri" component={FollowRequests} />
          <Route path="/notificari" component={Notifications} />
          <Route path="/siguranta" component={SafetyCenter} />
          <Route path="/moderare" component={Moderation} />
          <Route path="/search" component={Search} />
          <Route path="/salvate" component={SavedPosts} />
          <Route path="/despre" component={About} />
          <Route path="/reguli" component={CommunityGuidelines} />
          <Route path="/confidentialitate" component={Privacy} />
          <Route path="/termeni" component={Terms} />
          <Route path="/ajutor" component={Help} />
          <Route path="/verify-email" component={VerifyEmail} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/verify-email-change" component={VerifyEmailChange} />
          <Route path="*404" component={NotFound} />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  ),
  root
);
