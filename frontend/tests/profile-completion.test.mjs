import assert from 'node:assert/strict';
import test from 'node:test';
import { getProfileCompletion } from '../app/src/utils/profileCompletion.js';

test('starts with four actionable incomplete profile steps', () => {
  const completion = getProfileCompletion(null);
  assert.equal(completion.completed, 0);
  assert.equal(completion.total, 4);
  assert.equal(completion.percent, 0);
  assert.deepEqual(completion.steps.map(({ id }) => id), ['avatar', 'bio', 'post', 'connection']);
});

test('computes completion only from meaningful existing profile data', () => {
  const completion = getProfileCompletion({
    avatar_url: '/uploads/avatars/example.webp',
    bio: 'Îmi plac conversațiile bune.',
    posts_count: 2,
    following_count: 1,
  });
  assert.equal(completion.completed, 4);
  assert.equal(completion.percent, 100);
  assert.ok(completion.steps.every(({ complete }) => complete));
});

test('uses a bounded fallback post count and rejects misleading values', () => {
  assert.equal(getProfileCompletion({ posts_count: null }, 1).steps.find(({ id }) => id === 'post').complete, true);
  assert.equal(getProfileCompletion({ posts_count: undefined }, 1).steps.find(({ id }) => id === 'post').complete, true);
  assert.equal(getProfileCompletion({ posts_count: -8 }, 1).steps.find(({ id }) => id === 'post').complete, true);
  assert.equal(getProfileCompletion({ following_count: 'not-a-number', bio: '   ' }).percent, 0);
});
