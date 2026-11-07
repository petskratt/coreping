import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLoss, formatTimestamp, histogram, numericSnrs, standardDeviation, summarize } from '../src/lib/stats.js';

test('summarize reports min, max, average, and 2 dB buckets', () => {
  const summary = summarize([-1.5, -0.25, 0.5, 3.25]);
  assert.equal(summary.min, -1.5);
  assert.equal(summary.max, 3.25);
  assert.equal(summary.count, 4);
  assert.ok(Math.abs(summary.avg - 0.5) < 1e-9);
  assert.deepEqual(summary.histogram, histogram([-1.5, -0.25, 0.5, 3.25]));
  assert.deepEqual(summary.histogram, [
    { from: -2, to: 0, count: 2 },
    { from: 0, to: 2, count: 1 },
    { from: 2, to: 4, count: 1 },
  ]);
});

test('standard deviation uses the sample formula, and loss counts missing replies', () => {
  assert.equal(standardDeviation([1, 2, 3]), 1);
  const summary = summarize([{ snr: 1 }, { snr: null }, { snr: 3 }]);
  assert.equal(summary.count, 2);
  assert.equal(summary.attempts, 3);
  assert.equal(summary.loss, 1 / 3);
  assert.equal(summary.stdev, standardDeviation([1, 3]));
  assert.equal(formatLoss(summary.loss), '33.3%');
  assert.equal(summarize([{ snr: null }]).stdev, null);
});

test('timestamps use local yyyy-mm-dd hh:mm:ss', () => {
  const stamp = new Date(2026, 10, 7, 10, 5, 2).getTime();
  assert.equal(formatTimestamp(stamp), '2026-11-07 10:05:02');
});

test('empty input has no summary', () => {
  assert.equal(summarize([]), null);
});

test('numeric samples skip gaps', () => {
  assert.deepEqual(numericSnrs([{ snr: 1 }, { snr: null }, { snr: Number.NaN }, { snr: -0.25 }]), [1, -0.25]);
});
