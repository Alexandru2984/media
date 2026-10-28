import { createSignal, createContext, useContext, onMount } from 'solid-js';
import { api } from './api';

const AuthContext = createContext();

export function AuthProvider(props) {
  const [user, setUser] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  // Migrate old browser-readable bearer tokens once, then rely on HttpOnly cookies.
  onMount(async () => {
    const legacyToken = localStorage.getItem('token');
    try {
      if (legacyToken) {
        api.setToken(legacyToken);
        const data = await api.migrateSession();
        setUser(data.user);
        api.clearToken();
      } else {
        const userData = await api.getCurrentUser();
        setUser(userData);
      }
    } catch (error) {
      api.clearToken();
    }
    setLoading(false);
  });

  const login = async (email, password) => {
    setLoading(true);
    try {
      const data = await api.login(email, password);
      setUser(data.user);
      return data.user;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (username, email, password, bio) => {
    setLoading(true);
    try {
      const data = await api.register(username, email, password, bio);
      setUser(data.user);
      return data.user;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    setUser,
    loading,
    login,
    register,
    logout,
    isAuthenticated: () => !!user(),
  };

  return (
    <AuthContext.Provider value={value}>
      {props.children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
