import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShareUrl, shareInternalLink } from '../app/src/utils/sharing.js';

test('shares only canonical internal post/profile URLs without credentials or URL secrets', () => {
  assert.equal(buildShareUrl('/profile/user', 'https://media.micutu.com'), 'https://media.micutu.com/profile/user');
  for (const path of ['//evil.example/post/a', 'https://evil.example/profile/a', '/post/a?token=secret', '/post/a#secret', '/post/../settings', '/post/%2e%2e', '/post/a\n', '/\\evil.example/post/a', '/settings']) {
    assert.throws(() => buildShareUrl(path, 'https://media.micutu.com'), path);
  }
  assert.throws(() => buildShareUrl('/post/a', 'https://user:password@media.micutu.com'));
});

test('uses native sharing with only a title and canonical URL', async () => {
  let sent;
  const result = await shareInternalLink('/post/id', 'Postare', { location: { origin: 'https://media.micutu.com' }, navigator: { share: async (data) => { sent = data; } } });
  assert.equal(result.status, 'shared');
  assert.deepEqual(sent, { title: 'Postare', url: 'https://media.micutu.com/post/id' });
});

test('does not copy anything when native sharing is cancelled', async () => {
  const result = await shareInternalLink('/post/id', 'Postare', { location: { origin: 'https://media.micutu.com' }, navigator: { share: async () => { throw new DOMException('cancelled', 'AbortError'); }, clipboard: { writeText: () => { throw new Error('must not run'); } } } });
  assert.equal(result.status, 'cancelled');
});

test('falls back from failed native sharing to clipboard and then manual copy', async () => {
  const environment = { location: { origin: 'https://media.micutu.com' }, navigator: { share: async () => { throw new Error('denied'); }, clipboard: { writeText: async () => {} } } };
  assert.equal((await shareInternalLink('/profile/id', 'Profil', environment)).status, 'copied');
  environment.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
  const result = await shareInternalLink('/profile/id', 'Profil', environment);
  assert.equal(result.status, 'manual');
  assert.equal(result.url, 'https://media.micutu.com/profile/id');
});
