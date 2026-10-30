import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readStoredTheme,
  removeLegacyToken,
  resolveInitialTheme,
  storeTheme,
} from '../app/src/storage.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test('accepts only supported stored themes', () => {
  assert.equal(readStoredTheme({ localStorage: memoryStorage({ theme: 'dark' }) }), 'dark');
  assert.equal(readStoredTheme({ localStorage: memoryStorage({ theme: 'system<script>' }) }), null);
});

test('falls back to system preference and then light', () => {
  assert.equal(resolveInitialTheme({
    localStorage: memoryStorage(),
    matchMedia: () => ({ matches: true }),
  }), 'dark');
  assert.equal(resolveInitialTheme({}), 'light');
  assert.equal(storeTheme('dark', {}), false);
  assert.equal(removeLegacyToken({}), false);
});

test('survives browsers that deny access to the storage getter', () => {
  const denied = {};
  Object.defineProperty(denied, 'localStorage', {
    get() {
      throw new DOMException('denied', 'SecurityError');
    },
  });
  assert.equal(readStoredTheme(denied), null);
  assert.equal(storeTheme('dark', denied), false);
  assert.equal(removeLegacyToken(denied), false);
});

test('survives denied writes and removes only the obsolete token key', () => {
  const throwingStorage = {
    setItem() {
      throw new DOMException('quota', 'QuotaExceededError');
    },
  };
  assert.equal(storeTheme('dark', { localStorage: throwingStorage }), false);
  assert.equal(storeTheme('unsupported', { localStorage: memoryStorage() }), false);

  const storage = memoryStorage({ token: 'obsolete-secret', theme: 'light' });
  assert.equal(removeLegacyToken({ localStorage: storage }), true);
  assert.equal(storage.values.has('token'), false);
  assert.equal(storage.values.get('theme'), 'light');
});
