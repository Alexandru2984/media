import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCommandPaletteCommands,
  filterCommandPaletteCommands,
  isEditableTarget,
  normalizeCommandSearch,
} from '../app/src/utils/commandPalette.js';

test('normalizes Romanian diacritics for forgiving command search', () => {
  assert.equal(normalizeCommandSearch('  SIGURANȚĂ  '), 'siguranta');
  assert.equal(normalizeCommandSearch('Urmărire'), 'urmarire');
});

test('keeps authenticated and privileged routes out of the public palette', () => {
  const publicIds = buildCommandPaletteCommands().map(({ id }) => id);
  assert.ok(publicIds.includes('login'));
  assert.ok(publicIds.includes('register'));
  assert.ok(!publicIds.includes('profile'));
  assert.ok(!publicIds.includes('moderation'));
});

test('adds account commands safely and exposes moderation only to trusted roles', () => {
  const memberCommands = buildCommandPaletteCommands({
    authenticated: true,
    userId: 'user/../../moderare?tab=roluri',
    role: 'member',
  });
  const memberProfile = memberCommands.find(({ id }) => id === 'profile');
  assert.equal(memberProfile.path, '/profile/user%2F..%2F..%2Fmoderare%3Ftab%3Droluri');
  assert.ok(!memberCommands.some(({ id }) => id === 'moderation'));

  const moderatorIds = buildCommandPaletteCommands({
    authenticated: true,
    userId: 'user-id',
    role: 'moderator',
  }).map(({ id }) => id);
  assert.ok(moderatorIds.includes('moderation'));
  assert.ok(!moderatorIds.includes('login'));
});

test('ranks title matches before keyword matches and supports diacritics', () => {
  const commands = buildCommandPaletteCommands({ authenticated: true, userId: 'user-id' });
  assert.equal(filterCommandPaletteCommands(commands, 'siguranță')[0].id, 'safety');
  assert.equal(filterCommandPaletteCommands(commands, 'postare')[0].id, 'compose');
  assert.equal(filterCommandPaletteCommands(commands, 'avatar')[0].id, 'profile');
  assert.deepEqual(filterCommandPaletteCommands(commands, 'termen-inexistent'), []);
});

test('does not reserve global shortcuts while the user edits a field', () => {
  assert.equal(isEditableTarget({ tagName: 'INPUT' }), true);
  assert.equal(isEditableTarget({ tagName: 'textarea' }), true);
  assert.equal(isEditableTarget({ tagName: 'SELECT' }), true);
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isEditableTarget({ tagName: 'BUTTON' }), false);
});
