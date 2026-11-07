import assert from 'node:assert/strict';
import test from 'node:test';
import { runLimitReached, waitAfterRound, waitingLine } from '../src/lib/schedule.js';
import { appendSamples, clampTraceLimits, clipForwardHops, durationHoursLabel, sanitizeState, SAMPLE_CAP } from '../src/lib/store.js';

test('the next round waits out whatever part of the interval is left', () => {
  assert.equal(waitAfterRound(1000, 1000, 30000), 30000);
  assert.equal(waitAfterRound(1000, 20000, 30000), 11000);
  assert.equal(waitAfterRound(1000, 40000, 30000), 0);
});

test('a round that starts at :05 and ends at :10 next starts at :20', () => {
  const started = 5_000;
  const finished = 10_000;
  assert.equal(waitAfterRound(started, finished, 15_000), 10_000);
  assert.equal(started + 15_000, finished + waitAfterRound(started, finished, 15_000));
});

test('a run past the limit is finished', () => {
  assert.equal(runLimitReached(0, 4 * 3600 * 1000 - 1, 4 * 3600), false);
  assert.equal(runLimitReached(0, 4 * 3600 * 1000, 4 * 3600), true);
});

test('the wait line counts whole seconds', () => {
  assert.equal(waitingLine(60_000), 'waiting 60 seconds');
  assert.equal(waitingLine(1_001), 'waiting 2 seconds');
  assert.equal(waitingLine(1), 'waiting 1 second');
});

test('runs longer than 4 hours cannot trace faster than every 5 minutes', () => {
  assert.deepEqual(clampTraceLimits(60, 4 * 3600), { intervalSec: 60, maxDurationSec: 4 * 3600 });
  assert.deepEqual(clampTraceLimits(15, 8 * 3600), { intervalSec: 300, maxDurationSec: 8 * 3600 });
  assert.deepEqual(clampTraceLimits(900, 48 * 3600), { intervalSec: 900, maxDurationSec: 48 * 3600 });
  assert.deepEqual(clampTraceLimits(7, 3), { intervalSec: 60, maxDurationSec: 4 * 3600 });
  assert.equal(durationHoursLabel(8 * 3600), '8 hours');
});

test('stored state drops junk and caps samples', () => {
  const state = sanitizeState({
    intervalSec: 15,
    hashBytes: 3,
    targets: [
      { id: 'a', hops: ['ab12', 4], enabled: false },
      { hops: ['nope'] },
    ],
    samples: [{ t: 1, targetId: 'a' }, { targetId: 'missing' }],
    visibility: { 'a:out:0': false, bad: 'no' },
  });
  assert.equal(state.intervalSec, 15);
  assert.equal(state.maxDurationSec, 4 * 3600);
  assert.equal(state.hashBytes, 2);
  assert.deepEqual(state.targets, [{ id: 'a', hops: ['ab12'], enabled: false }]);
  assert.equal(state.samples.length, 1);
  assert.deepEqual(state.breaks, []);
  assert.deepEqual(state.visibility, { 'a:out:0': false });
  const withBreaks = sanitizeState({ breaks: [10, 'no', 20], samples: [{ t: 1, targetId: 'a' }] });
  assert.deepEqual(withBreaks.breaks, [10, 20]);
  const longRun = sanitizeState({ intervalSec: 30, maxDurationSec: 12 * 3600 });
  assert.equal(longRun.intervalSec, 300);
  assert.equal(longRun.maxDurationSec, 12 * 3600);
  const kept = sanitizeState({ intervalSec: 600, maxDurationSec: 24 * 3600 });
  assert.equal(kept.intervalSec, 600);
  assert.equal(withBreaks.samples.length, 1);
});

test('path steps default to 4 forward nodes and a longer path is cut', () => {
  const state = sanitizeState({
    targets: [{ id: 'a', hops: ['aa', 'bb', 'cc', 'dd', 'ee'] }],
  });
  assert.equal(state.pathSteps, 4);
  assert.deepEqual(state.targets[0].hops, ['aa', 'bb', 'cc', 'dd']);
  const deeper = sanitizeState({
    pathSteps: 6,
    targets: [{ id: 'a', hops: ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', '11'] }],
  });
  assert.equal(deeper.pathSteps, 6);
  assert.deepEqual(deeper.targets[0].hops, ['aa', 'bb', 'cc', 'dd', 'ee', 'ff']);
  assert.equal(sanitizeState({ pathSteps: 9 }).pathSteps, 4);
  assert.equal(sanitizeState({ pathSteps: '4' }).pathSteps, 4);
  assert.deepEqual(clipForwardHops(['aa', 'bb', 'cc'], 8), ['aa', 'bb', 'cc']);
});

test('appendSamples keeps the newest points', () => {
  const existing = Array.from({ length: SAMPLE_CAP }, (_, index) => ({ t: index }));
  const next = appendSamples(existing, [{ t: SAMPLE_CAP }]);
  assert.equal(next.length, SAMPLE_CAP);
  assert.equal(next[0].t, 1);
  assert.equal(next.at(-1).t, SAMPLE_CAP);
});
