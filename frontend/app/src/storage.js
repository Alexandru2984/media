const validThemes = new Set(['light', 'dark']);

export function readStoredTheme(environment = globalThis) {
  try {
    const value = environment.localStorage?.getItem('theme');
    return validThemes.has(value) ? value : null;
  } catch {
    return null;
  }
}

export function resolveInitialTheme(environment = globalThis) {
  const storedTheme = readStoredTheme(environment);
  if (storedTheme) return storedTheme;
  try {
    return environment.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function storeTheme(theme, environment = globalThis) {
  if (!validThemes.has(theme)) return false;
  try {
    const storage = environment.localStorage;
    if (!storage) return false;
    storage.setItem('theme', theme);
    return true;
  } catch {
    return false;
  }
}

export function removeLegacyToken(environment = globalThis) {
  try {
    const storage = environment.localStorage;
    if (!storage) return false;
    storage.removeItem('token');
    return true;
  } catch {
    return false;
  }
}
