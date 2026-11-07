import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleBoard } from '../src/lib/sample.js';
import { splitSessions } from '../src/lib/timeline.js';

test('the sample is two paths, three runs, and 100 traces', () => {
  const board = sampleBoard(1_700_000_000_000);
  assert.equal(board.samples.length, 100);
  assert.equal(board.targets.length, 2);
  assert.deepEqual(board.targets.map((target) => target.hops.at(-1)), ['164a', 'd34d']);
  const sessions = splitSessions(board.samples.map((sample) => sample.t), board.breaks);
  assert.equal(sessions.length, 3);
  assert.equal(sessions.reduce((sum, group) => sum + group.length, 0), 100);
  assert.equal(board.names['164a'], 'Nova');
  assert.equal(board.names.d34d, 'Paldiski');
  assert.ok(board.contacts.some((contact) => contact.name === 'ES2KRT'));
  assert.ok(board.samples.some((sample) => sample.error === 'timeout'));
});
