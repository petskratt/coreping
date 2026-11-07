import assert from 'node:assert/strict';
import test from 'node:test';
import { readBackup } from '../src/lib/backup.js';
import { refreshNames } from '../src/lib/names.js';
import { sanitizeState, STORAGE_KEY } from '../src/lib/store.js';

test('saved contact names survive and old data still has none', () => {
  const state = sanitizeState({
    targets: [{ id: 'a', hops: ['AB12'] }],
    samples: [{ t: 1, targetId: 'a', sent: ['ab12', 'cd34'] }],
    names: { AB12: ' Repeater ', cd34: 'Far', ef56: 'Unused', nope: 'x', zz: '' },
    selfName: ' T-Echo ',
  });
  assert.deepEqual(state.names, { ab12: 'Repeater', cd34: 'Far' });
  assert.equal(state.selfName, 'T-Echo');

  const old = sanitizeState({ targets: [{ id: 'a', hops: ['ab12'] }], samples: [{ t: 1, targetId: 'a' }] });
  assert.deepEqual(old.names, {});
  assert.equal(old.selfName, 'me');
});

test('connecting refreshes a unique contact and keeps a name the radio no longer has', () => {
  const contacts = [
    { name: 'Repeater north', publicKey: [0xab, 0x12, 0x00] },
    { name: 'Other', publicKey: [0xab, 0x99] },
  ];
  const stored = { ab12: 'Repeater', cd34: 'Far node', ef56: 'Neighbour' };
  const next = refreshNames(stored, contacts, ['ab12', 'cd34', 'ef56']);
  assert.equal(next.ab12, 'Repeater north');
  assert.equal(next.cd34, 'Far node');
  assert.equal(next.ef56, 'Neighbour');
  assert.deepEqual(refreshNames({}, contacts, ['ab12']), { ab12: 'Repeater north' });
});

test('an ambiguous prefix keeps the stored name instead of guessing', () => {
  const contacts = [
    { name: 'One', publicKey: [0xab] },
    { name: 'Two', publicKey: [0xab] },
  ];
  assert.equal(refreshNames({ ab: 'Old' }, contacts, ['ab']).ab, 'Old');
  assert.deepEqual(refreshNames({}, contacts, ['ab']), {});
});

test('a json backup round-trips the stored names', () => {
  const state = readBackup({
    [STORAGE_KEY]: {
      targets: [{ id: 'a', hops: ['ab12'] }],
      samples: [{ t: 1, targetId: 'a' }],
      names: { ab12: 'Repeater' },
      selfName: 'T-Echo',
    },
  });
  assert.deepEqual(state.names, { ab12: 'Repeater' });
  assert.equal(state.selfName, 'T-Echo');
});
