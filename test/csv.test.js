import assert from 'node:assert/strict';
import test from 'node:test';
import { binLabel, buildCsv } from '../src/lib/csv.js';
import { completedLine, tracingLine } from '../src/lib/log.js';

test('csv summary uses 2 dB columns and samples use a local timestamp', () => {
  const csv = buildCsv(
    [{
      label: 'Far node heard Repeater',
      summary: {
        count: 2,
        loss: 1 / 3,
        min: -3.25,
        avg: -2,
        max: -0.75,
        stdev: 1.7677669529663689,
        histogram: [
          { from: -4, to: -2, count: 1 },
          { from: -2, to: 0, count: 1 },
        ],
      },
    }],
    [{
      t: new Date(2026, 10, 7, 10, 5, 2).getTime(),
      hopIndex: 1,
      target: 'Repeater -> Far node',
      path: 'ab12,cd34,ab12',
      hop: 'Far node heard Repeater',
      direction: 'out',
      snr: -3.25,
    }, {
      t: new Date(2026, 10, 7, 10, 6, 2).getTime(),
      hopIndex: 1,
      target: 'Repeater -> Far node',
      path: 'ab12,cd34,ab12',
      hop: 'Far node heard Repeater',
      direction: 'out',
      snr: null,
    }],
  );

  const [summary, samples] = csv.trim().split('\n\n');
  assert.equal(summary.split('\n')[0], `hop,n,loss,min,avg,max,stdev,${binLabel(-4)},${binLabel(-2)}`);
  assert.match(summary, /33\.3%/);
  assert.match(summary, /-3\.25/);
  assert.equal(
    samples.split('\n')[1],
    '2026-11-07 10:05:02,Repeater -> Far node,"ab12,cd34,ab12",Far node heard Repeater,out,-3.25',
  );
  assert.equal(
    samples.split('\n')[2],
    '2026-11-07 10:06:02,Repeater -> Far node,"ab12,cd34,ab12",Far node heard Repeater,out,',
  );
});

test('console lines name the path and keep a running trace unmarked by time', () => {
  const names = { ab12: 'Repeater', cd34: 'Far node' };
  const nameOf = (hex) => (hex == null ? 'T-Echo' : names[hex] || hex);
  assert.equal(tracingLine(['ab12', 'cd34', 'ab12'], nameOf), 'Tracing Repeater -> Far node -> Repeater...');
  const line = completedLine({
    t: new Date(2026, 10, 7, 10, 5, 7).getTime(),
    sent: ['ab12', 'cd34', 'ab12'],
    snrs: [9, -3.25, 1.5],
    lastSnr: 8,
    error: null,
  }, nameOf);
  assert.equal(line, '2026-11-07 10:05:07  Repeater -> Far node -> Repeater  9.00, -3.25, 1.50, local 8.00 dB');
  assert.match(completedLine({
    t: new Date(2026, 10, 7, 10, 5, 9).getTime(),
    sent: ['ef56'],
    snrs: null,
    error: 'timeout',
  }, nameOf), /timeout$/);
});
