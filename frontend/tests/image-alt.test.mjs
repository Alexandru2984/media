import assert from 'node:assert/strict';
import test from 'node:test';
import { imageAltIsValid, imageAltLength } from '../app/src/utils/imageAlt.js';

test('accepts optional descriptions and counts the same Unicode characters as the API', () => {
  assert.equal(imageAltIsValid(''), true);
  assert.equal(imageAltIsValid('  Orașul la apus.  '), true);
  assert.equal(imageAltLength('  📷📷  '), 2);
  assert.equal(imageAltIsValid('📷'.repeat(300)), true);
  assert.equal(imageAltIsValid('📷'.repeat(301)), false);
});

test('treats markup as description text while rejecting controls and multiline payloads', () => {
  assert.equal(imageAltIsValid('Un afiș cu <text> și "cărți".'), true);
  for (const text of ['a\0b', 'două\nrânduri', 'două\trânduri', 'a\u0085b', null]) {
    assert.equal(imageAltIsValid(text), false);
  }
});
