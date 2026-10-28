/* @refresh reload */
import { render } from 'solid-js/web';
import { Router, Route } from '@solidjs/router';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmailChange from './pages/VerifyEmailChange';
import Search from './pages/Search';
import About from './pages/About';
import CommunityGuidelines from './pages/CommunityGuidelines';
import SavedPosts from './pages/SavedPosts';
import NotFound from './pages/NotFound';
import './index.css';

const root = document.getElementById('root');

render(
  () => (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Route path="/" component={Home} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/profile/:id" component={Profile} />
          <Route path="/search" component={Search} />
          <Route path="/salvate" component={SavedPosts} />
          <Route path="/despre" component={About} />
          <Route path="/reguli" component={CommunityGuidelines} />
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
