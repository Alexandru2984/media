import { createSignal, createContext, useContext, onMount } from 'solid-js';
import { api } from './api';

const AuthContext = createContext();

export function AuthProvider(props) {
  const [user, setUser] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  // Check if user is already logged in on mount
  onMount(async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        // Set token in api service before making request
        api.setToken(token);
        // Verify token by fetching current user
        const userData = await api.getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error('Token validation failed:', error);
        api.clearToken();
      }
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

  const logout = () => {
    api.clearToken();
    setUser(null);
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