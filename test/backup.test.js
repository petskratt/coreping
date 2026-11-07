import assert from 'node:assert/strict';
import test from 'node:test';
import { dumpStorage, mergeState, readBackup, restoreBackup } from '../src/lib/backup.js';
import { STORAGE_KEY } from '../src/lib/store.js';

function memory(initial = {}) {
  const data = { ...initial };
  return {
    get length() { return Object.keys(data).length; },
    key(index) { return Object.keys(data)[index] ?? null; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
  };
}

test('a storage dump keeps the saved setup', () => {
  const storage = memory({
    [STORAGE_KEY]: JSON.stringify({ intervalSec: 15, targets: [{ id: 'a', hops: ['ab12'] }], samples: [{ t: 1, targetId: 'a' }] }),
    note: 'plain',
  });
  const dump = dumpStorage(storage);
  assert.equal(dump[STORAGE_KEY].intervalSec, 15);
  assert.equal(dump.note, 'plain');
  assert.equal(readBackup(dump).samples.length, 1);
});

test('import accepts a bare setup or a full dump and drops junk', () => {
  const bare = readBackup({
    intervalSec: 60,
    targets: [{ id: 'a', hops: ['ab12', 4] }],
    samples: [{ t: 5, targetId: 'a' }, { t: 'no' }],
  });
  assert.equal(bare.intervalSec, 60);
  assert.deepEqual(bare.targets, [{ id: 'a', hops: ['ab12'], enabled: true }]);
  assert.equal(bare.samples.length, 1);

  const storage = memory();
  const restored = restoreBackup({
    [STORAGE_KEY]: { intervalSec: 30, samples: [{ t: 2, targetId: 'b' }] },
    note: 'kept',
  }, storage);
  assert.equal(restored.samples.length, 1);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).samples[0].t, 2);
  assert.equal(storage.getItem('note'), 'kept');
});

test('import adds traces and keeps the ones already saved', () => {
  const merged = mergeState({
    intervalSec: 15,
    selfName: 'T-Echo',
    names: { ab12: 'Repeater' },
    targets: [{ id: 'local', hops: ['ab12', 'cd34'], enabled: true }],
    samples: [{ t: 1, targetId: 'local', sent: ['ab12', 'cd34', 'ab12'], snrs: [1, 2, 3], lastSnr: 4 }],
    breaks: [9],
  }, {
    intervalSec: 60,
    selfName: 'petskratt',
    names: { ab12: 'Other', cd34: 'Far' },
    targets: [{ id: 'file', hops: ['ab12', 'cd34'] }, { id: 'file-2', hops: ['ef56'] }],
    samples: [
      { t: 1, targetId: 'file', sent: ['ab12', 'cd34', 'ab12'], snrs: [9, 9, 9], lastSnr: 9 },
      { t: 2, targetId: 'file', sent: ['ab12', 'cd34', 'ab12'], snrs: [3, 4, 5], lastSnr: 6 },
      { t: 3, targetId: 'file-2', sent: ['ef56'], snrs: [7], lastSnr: 8 },
    ],
    breaks: [9, 20],
  });
  assert.equal(merged.intervalSec, 15);
  assert.equal(merged.selfName, 'T-Echo');
  assert.equal(merged.names.ab12, 'Repeater');
  assert.equal(merged.names.cd34, 'Far');
  assert.deepEqual(merged.targets.map((target) => target.id), ['local', 'file-2']);
  assert.deepEqual(merged.samples.map((sample) => [sample.t, sample.targetId, sample.snrs[0]]), [
    [1, 'local', 1],
    [2, 'local', 3],
    [3, 'file-2', 7],
  ]);
  assert.deepEqual(merged.breaks, [9, 20]);
});

test('a file without meshpath data is refused', () => {
  assert.throws(() => readBackup({ hello: 'nope' }), /no meshpath data/);
  assert.throws(() => readBackup(null), /not a meshpath backup/);
});
