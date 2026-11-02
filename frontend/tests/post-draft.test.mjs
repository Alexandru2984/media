import assert from 'node:assert/strict';
import test from 'node:test';
import { readPostDraft, removePostDraft, storePostDraft } from '../app/src/utils/postDraft.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test('stores bounded text per user in session storage', () => {
  const sessionStorage = memoryStorage();
  const environment = { sessionStorage };
  const now = Date.UTC(2026, 10, 2, 12, 0, 0);

  assert.equal(storePostDraft('user-one', 'Prima schiță', environment, now), true);
  assert.deepEqual(readPostDraft('user-one', environment, now + 1000), {
    content: 'Prima schiță',
    savedAt: now,
  });
  assert.equal(readPostDraft('user-two', environment, now + 1000), null);
  assert.equal([...sessionStorage.values.keys()][0], 'media:post-draft:v1:user-one');
});

test('rejects empty, oversized, and invalid user drafts', () => {
  const environment = { sessionStorage: memoryStorage() };
  assert.equal(storePostDraft('', 'text', environment), false);
  assert.equal(storePostDraft('user', '   ', environment), false);
  assert.equal(storePostDraft('user', 'x'.repeat(501), environment), false);
  assert.equal(storePostDraft('x'.repeat(129), 'text', environment), false);
});

test('expires drafts after 24 hours and removes malformed values', () => {
  const now = Date.UTC(2026, 10, 2, 12, 0, 0);
  const key = 'media:post-draft:v1:user';
  const sessionStorage = memoryStorage({
    [key]: JSON.stringify({ version: 1, content: 'Prea veche', savedAt: now - 86_400_001 }),
  });
  const environment = { sessionStorage };

  assert.equal(readPostDraft('user', environment, now), null);
  assert.equal(sessionStorage.values.has(key), false);

  sessionStorage.setItem(key, '{not-json');
  assert.equal(readPostDraft('user', environment, now), null);
  assert.equal(sessionStorage.values.has(key), false);

  sessionStorage.setItem(key, 'x'.repeat(2049));
  assert.equal(readPostDraft('user', environment, now), null);
  assert.equal(sessionStorage.values.has(key), false);
});

test('removes a published or logged-out draft and tolerates blocked storage', () => {
  const sessionStorage = memoryStorage();
  const environment = { sessionStorage };
  assert.equal(storePostDraft('user', 'Text temporar', environment), true);
  assert.equal(removePostDraft('user', environment), true);
  assert.equal(readPostDraft('user', environment), null);

  const denied = {};
  Object.defineProperty(denied, 'sessionStorage', {
    get() {
      throw new DOMException('denied', 'SecurityError');
    },
  });
  assert.equal(storePostDraft('user', 'Text', denied), false);
  assert.equal(readPostDraft('user', denied), null);
  assert.equal(removePostDraft('user', denied), false);
});
