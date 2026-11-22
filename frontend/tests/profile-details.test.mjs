import test from 'node:test';
import assert from 'node:assert/strict';
import { publicWebsite, profileCoreIsValid, profileDetailsAreValid, profileDetailsFrom } from '../app/src/utils/profileDetails.js';
test('profile details are optional Unicode text with matching scalar limits', () => {
  assert(profileDetailsAreValid(profileDetailsFrom(null)));
  assert(profileDetailsAreValid({ ...profileDetailsFrom(null), display_name: '📚'.repeat(50) }));
  assert(!profileDetailsAreValid({ ...profileDetailsFrom(null), display_name: '📚'.repeat(51) }));
  assert(!profileDetailsAreValid({ ...profileDetailsFrom(null), location: 'București\nAlt loc' }));
  assert(profileCoreIsValid('📚'.repeat(32), '📷'.repeat(240)));
  assert(!profileCoreIsValid('x', 'Bio'));
});
test('external websites reject ambiguous schemes, credentials and non-public hosts', () => {
  assert.equal(publicWebsite(' HTTPS://EXAMPLE.COM:443/portofoliu?q=1#intro '), 'https://example.com/portofoliu?q=1#intro');
  assert.equal(publicWebsite('https://exemplu.ro/cărți'), 'https://exemplu.ro/c%C4%83r%C8%9Bi');
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//example.com', 'https:example.com', 'http://example.com', 'https://user:pass@example.com', 'https://example.com@evil.com', 'https://127.0.0.1', 'https://0x7f000001', 'https://[::1]', 'https://localhost.', 'https://app.internal', 'https://example.com:8443', 'https://example.com/a b', 'https://example.com\\@evil.com', '\thttps://example.com']) assert.equal(publicWebsite(url), null, url);
});
