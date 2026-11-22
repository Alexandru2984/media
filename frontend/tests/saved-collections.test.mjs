import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionNameIsValid, collectionNameLength } from '../app/src/utils/savedCollections.js';

test('collection names count Unicode scalars at the API boundary', () => {
  assert.equal(collectionNameLength('📚'.repeat(60)), 60);
  assert.equal(collectionNameIsValid('📚'.repeat(60)), true);
  assert.equal(collectionNameIsValid('📚'.repeat(61)), false);
  assert.equal(collectionNameIsValid('  Lecturi & <idei>  '), true);
});

test('collection names reject blanks and controls, including trimmed controls', () => {
  for (const value of ['', '　 ', '\tTitlu', 'Titlu\nascuns', 'Titlu\u0000', 'Titlu\u0085', null, {}]) {
    assert.equal(collectionNameIsValid(value), false);
  }
});
