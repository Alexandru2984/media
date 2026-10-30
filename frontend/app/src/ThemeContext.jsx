import { createContext, useContext, createSignal, onMount } from 'solid-js';
import { resolveInitialTheme, storeTheme } from './storage';

const ThemeContext = createContext();

export function ThemeProvider(props) {
  const [theme, setTheme] = createSignal('light');

  const applyTheme = (nextTheme) => {
    const dark = nextTheme === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    document.body.classList.toggle('dark', dark);
  };

  onMount(() => {
    const initialTheme = resolveInitialTheme(window);
    setTheme(initialTheme);
    applyTheme(initialTheme);
  });

  const toggleTheme = () => {
    const newTheme = theme() === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    storeTheme(newTheme, window);
    applyTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
