import assert from 'node:assert/strict';
import test from 'node:test';
import { encodePathSegment, profilePath, withQuery } from '../app/src/utils/urls.js';

test('keeps attacker-controlled values inside one path segment', () => {
  assert.equal(
    encodePathSegment('../../auth?admin=true#fragment'),
    '..%2F..%2Fauth%3Fadmin%3Dtrue%23fragment',
  );
  assert.equal(
    profilePath('user/../../moderare?tab=roluri'),
    '/profile/user%2F..%2F..%2Fmoderare%3Ftab%3Droluri',
  );
});

test('encodes query values and omits only nullish fields', () => {
  assert.equal(
    withQuery('/messages', {
      user_id: 'victim&limit=50',
      empty: '',
      zero: 0,
      missing: null,
    }),
    '/messages?user_id=victim%26limit%3D50&empty=&zero=0',
  );
});

test('does not add an empty query delimiter', () => {
  assert.equal(withQuery('/posts', {}), '/posts');
});
