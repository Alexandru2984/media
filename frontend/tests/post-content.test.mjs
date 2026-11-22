import assert from 'node:assert/strict';
import test from 'node:test';
import { countPostCharacters, postContentIsValid } from '../app/src/utils/postContent.js';
import { readPostDraft, storePostDraft } from '../app/src/utils/postDraft.js';

test('counts Unicode scalar values consistently with the API', () => {
  assert.equal(countPostCharacters('Salut 👋, România!'), 17);
  assert.equal(countPostCharacters('📷'.repeat(500)), 500);
  assert.equal(postContentIsValid('📷'.repeat(500)), true);
  assert.equal(postContentIsValid('📷'.repeat(501)), false);
  assert.equal(countPostCharacters('a\u0306'), 2);
});

test('accepts lines and tabs but rejects empty text and control characters', () => {
  assert.equal(postContentIsValid('Un gând\n\t#cărți'), true);
  for (const value of ['', '  \n\t ', null, 'a\0b', 'a\u001bb', 'a\u0085b']) {
    assert.equal(postContentIsValid(value), false);
  }
});

test('round-trips full-length emoji drafts and rejects hidden controls', () => {
  const values = new Map();
  const environment = { sessionStorage: { setItem: (key, value) => values.set(key, value), getItem: (key) => values.get(key), removeItem: (key) => values.delete(key) } };
  const content = '📷'.repeat(500);
  assert.equal(storePostDraft('user', content, environment), true);
  assert.equal(readPostDraft('user', environment).content, content);
  assert.equal(storePostDraft('user', 'a\0b', environment), false);
});
