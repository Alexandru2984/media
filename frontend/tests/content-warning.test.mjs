import test from 'node:test';
import assert from 'node:assert/strict';
import { postWarningIsValid } from '../app/src/utils/postContent.js';
test('warning labels are optional single-line text with Unicode scalar limits', () => {
  assert(postWarningIsValid(''));
  assert(postWarningIsValid('📚'.repeat(100)));
  assert(postWarningIsValid('  Spoilere & <detalii>  '));
  for (const value of ['📚'.repeat(101), 'Două\nrânduri', '\tTitlu', 'Titlu\u0000', null]) assert.equal(postWarningIsValid(value), false);
});
