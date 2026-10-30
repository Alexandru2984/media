/* @refresh reload */
import { lazy, Suspense } from 'solid-js';
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

function RouteRoot(props) {
  return (
    <Suspense fallback={(
      <main class="route-loading" role="status" aria-live="polite" aria-busy="true">
        <svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.24" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <span>Se încarcă pagina…</span>
      </main>
    )}>
      {props.children}
    </Suspense>
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
