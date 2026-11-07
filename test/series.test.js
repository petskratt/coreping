import assert from 'node:assert/strict';
import test from 'node:test';
import { previewSession } from '../src/lib/preview.js';
import { buildSeries, describeTrace, isVisible, seriesLabel } from '../src/lib/series.js';

const multi = {
  targetId: 'rep',
  outboundCount: 2,
  sent: ['ab12', 'cd34', 'ab12'],
  snrs: [9, -3, 1.5],
  lastSnr: 8,
};

test('multi-hop hides the first hop and the local reply', () => {
  const points = describeTrace(multi);
  assert.equal(points.length, 4);
  assert.deepEqual(points.map((point) => point.dir), ['out', 'out', 'back', 'local']);
  assert.deepEqual(points.map((point) => point.style), ['solid', 'solid', 'dashed', 'dashed']);
  assert.equal(isVisible(points[0], {}), false);
  assert.equal(isVisible(points[1], {}), true);
  assert.equal(isVisible(points[2], {}), true);
  assert.equal(isVisible(points[3], {}), false);
  assert.equal(points[1].hearerHex, 'cd34');
  assert.equal(points[1].prevHex, 'ab12');
  assert.equal(points[2].hearerHex, 'ab12');
  assert.equal(points[2].prevHex, 'cd34');
});

test('a single hop shows both directions', () => {
  const points = describeTrace({
    targetId: 'direct',
    outboundCount: 1,
    sent: ['ef56'],
    snrs: [4],
    lastSnr: 3,
  });
  assert.equal(points.length, 2);
  assert.equal(isVisible(points[0], {}), true);
  assert.equal(isVisible(points[1], {}), true);
  assert.equal(points[0].style, 'solid');
  assert.equal(points[1].style, 'dashed');
});

test('a legend override wins over the default', () => {
  const [first] = describeTrace(multi);
  assert.equal(isVisible(first, { [first.key]: true }), true);
});

test('labels name who heard whom', () => {
  const [, far] = describeTrace(multi);
  const names = { ab12: 'Repeater', cd34: 'Far node' };
  const label = seriesLabel(far, (hex) => (hex == null ? 'T-Echo' : names[hex] || hex));
  assert.equal(label, 'Far node heard Repeater');
});

test('a failed sample breaks the line instead of connecting through it', () => {
  const targets = [
    { id: 'rep', hops: ['ab12', 'cd34'], enabled: true },
  ];
  const samples = [
    { t: 1, ...multi, error: null },
    { t: 2, targetId: 'rep', outboundCount: 2, sent: multi.sent, snrs: null, lastSnr: null, error: 'timeout' },
    { t: 3, ...multi, snrs: [8, -2, 1], lastSnr: 7, error: null },
  ];
  const far = buildSeries(targets, samples, true).find((series) => series.hearerHex === 'cd34' && series.prevHex === 'ab12');
  assert.deepEqual(far.values.map((point) => point.snr), [-3, null, -2]);
});

test('the same radio link from two targets is one series', () => {
  const targets = [
    { id: 'far', hops: ['ab12', 'cd34'], enabled: true },
    { id: 'side', hops: ['ab12', 'ef56'], enabled: true },
  ];
  const samples = [
    { t: 1, targetId: 'far', outboundCount: 2, sent: ['ab12', 'cd34', 'ab12'], snrs: [9, -3, 1], lastSnr: 8, error: null },
    { t: 2, targetId: 'side', outboundCount: 2, sent: ['ab12', 'ef56', 'ab12'], snrs: [7, 2, 0], lastSnr: 6, error: null },
  ];
  const lines = buildSeries(targets, samples, true);
  const uplink = lines.filter((line) => line.hearerHex === 'ab12' && line.prevHex == null);
  assert.equal(uplink.length, 1);
  assert.deepEqual(uplink[0].values.map((point) => point.snr), [9, 7]);
  const far = lines.filter((line) => line.hearerHex === 'cd34');
  assert.equal(far.length, 1);
  assert.deepEqual(far[0].values.map((point) => point.snr), [-3]);
  const local = lines.filter((line) => line.hearerHex == null && line.prevHex === 'ab12');
  assert.equal(local.length, 1);
  assert.deepEqual(local[0].values.map((point) => point.snr), [8, 6]);
});

test('a direct ping of a shared hop keeps that hop visible', () => {
  const targets = [
    { id: 'far', hops: ['ab12', 'cd34'], enabled: true },
    { id: 'direct', hops: ['ab12'], enabled: true },
  ];
  const lines = buildSeries(targets, [], true);
  const uplink = lines.find((line) => line.hearerHex === 'ab12' && line.prevHex == null);
  assert.equal(isVisible(uplink, {}), true);
});

test('preview rounds use the same series rules', () => {
  const session = previewSession(1_700_000_000_000);
  const lines = buildSeries(session.targets, session.samples, session.roundTrip);
  const repeaterFirst = lines.find((line) => line.hearerHex === 'ab12' && line.prevHex == null);
  const repeaterFar = lines.find((line) => line.hearerHex === 'cd34' && line.prevHex === 'ab12');
  const direct = lines.find((line) => line.hearerHex === 'ef56' && line.prevHex == null);
  assert.equal(isVisible(repeaterFirst, {}), false);
  assert.equal(isVisible(repeaterFar, {}), true);
  assert.equal(repeaterFar.style, 'solid');
  assert.equal(direct.style, 'solid');
  const repeaterBack = lines.find((line) => line.hearerHex === 'ab12' && line.prevHex === 'cd34');
  assert.equal(repeaterBack.style, 'dashed');
  assert.equal(repeaterFirst.style, 'solid');
  assert.notEqual(repeaterFar.style, repeaterBack.style);
  assert.equal(repeaterFirst.values.length, 72);
  assert.ok(repeaterFar.values.some((point) => point.snr == null));
  assert.ok(repeaterFar.values.some((point) => typeof point.snr === 'number'));
});
