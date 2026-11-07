import assert from 'node:assert/strict';
import test from 'node:test';
import { chartLabels, impliedBreaks, layoutSessions, pointsAreSeparated, segmentLabels, splitSessions } from '../src/lib/timeline.js';

test('a break splits samples into runs and ignores idle time', () => {
  const segments = splitSessions([0, 1000, 2000, 500000, 501000], [3000, 4000]);
  assert.deepEqual(segments, [[0, 1000, 2000], [500000, 501000]]);
});

test('the scale skips the gap and leaves room for the gray line', () => {
  const layout = layoutSessions([0, 1000, 2000, 500000, 501000], [3000], 200, 16);
  assert.equal(layout.dividers.length, 1);
  const left = layout.xOf(2000);
  const right = layout.xOf(500000);
  assert.ok(right - left < 20);
  assert.ok(layout.dividers[0] > left && layout.dividers[0] < right);
  const a = layout.xOf(0);
  const b = layout.xOf(1000);
  const c = layout.xOf(2000);
  assert.ok(Math.abs((b - a) - (c - b)) < 0.01);
});

test('points on either side of a stop are not connected', () => {
  assert.equal(pointsAreSeparated(2000, 500000, [3000]), true);
  assert.equal(pointsAreSeparated(0, 2000, [3000]), false);
  assert.equal(pointsAreSeparated(0, 1000, []), false);
});

test('a gap much longer than the interval is a chart break', () => {
  const times = [0, 60_000, 120_000, 120_000 + 30 * 60_000, 120_000 + 31 * 60_000];
  const marks = impliedBreaks(times, [], 60_000);
  assert.equal(marks.length, 1);
  assert.ok(marks[0] > 120_000 && marks[0] < times[3]);
  assert.deepEqual(impliedBreaks(times, marks, 60_000), []);
  assert.deepEqual(impliedBreaks([0, 60_000, 120_000], [], 60_000), []);
});

test('time labels mark both ends and round times that fit between them', () => {
  const hour = 60 * 60 * 1000;
  const labels = segmentLabels({ start: 0, end: 2 * hour, x0: 0, x1: 640 }, 16);
  assert.equal(labels[0].t, 0);
  assert.equal(labels[0].anchor, 'start');
  assert.equal(labels.at(-1).t, 2 * hour);
  assert.equal(labels.at(-1).anchor, 'end');
  assert.ok(labels.length > 3);
  for (const label of labels.slice(1, -1)) {
    assert.ok(label.t > 0 && label.t < 2 * hour);
    assert.equal(label.t % (15 * 60 * 1000), 0);
  }
});

test('each stopped run keeps its own start and end', () => {
  const labels = chartLabels([
    { start: 0, end: 60 * 60 * 1000, x0: 0, x1: 400 },
    { start: 5 * 60 * 60 * 1000, end: 6 * 60 * 60 * 1000, x0: 420, x1: 820 },
  ], 16);
  const times = labels.map((label) => label.t);
  assert.ok(times.includes(0));
  assert.ok(times.includes(60 * 60 * 1000));
  assert.ok(times.includes(5 * 60 * 60 * 1000));
  assert.ok(times.includes(6 * 60 * 60 * 1000));
});

test('a narrow run does not stack labels on top of each other', () => {
  const labels = segmentLabels({ start: 0, end: 60_000, x0: 0, x1: 30 }, 16);
  assert.equal(labels.length, 1);
});

test('a single sample still has a place to sit', () => {
  const layout = layoutSessions([1000], [], 200);
  assert.equal(layout.dividers.length, 0);
  assert.equal(layout.xOf(1000), 100);
});
