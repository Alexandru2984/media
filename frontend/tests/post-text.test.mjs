import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenizePostText } from '../app/src/utils/postText.js';

test('preserves Unicode text and discovers Romanian hashtag queries', () => {
  const text = 'Salut! (#cărți), #fotografie și #tehnologie_2026.';
  const tokens = tokenizePostText(text);
  assert.equal(tokens.map((token) => token.text).join(''), text);
  assert.deepEqual(tokens.filter((token) => token.query).map((token) => token.query), ['#cărți', '#fotografie', '#tehnologie_2026']);
  assert.equal(tokenizePostText('#ca\u0306rți')[0].query, '#cărți');
});

test('does not turn URL fragments, embedded hashtags or oversized tags into links', () => {
  for (const text of ['https://example.com/#secret', 'user#private@example.com', 'word#embedded', `#${'a'.repeat(33)}`, '#12numbers']) {
    assert.equal(tokenizePostText(text).some((token) => token.query), false, text);
    assert.equal(tokenizePostText(text).map((token) => token.text).join(''), text);
  }
});

test('keeps markup and unsafe URL syntax as literal text', () => {
  const text = '<img src=x onerror=alert(1)> #cărți javascript:alert(1)';
  const tokens = tokenizePostText(text);
  assert.equal(tokens.map((token) => token.text).join(''), text);
  assert.deepEqual(tokens.filter((token) => token.query), [{ text: '#cărți', query: '#cărți' }]);
  assert.deepEqual(tokenizePostText(null), []);
});
