import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignColorIndices,
  colorForLink,
  hueSequence,
  LOCAL_GREY,
  paletteColor,
  pairKey,
} from '../src/lib/colors.js';
import { sanitizeState } from '../src/lib/store.js';

function channels(hex) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function saturation(hex) {
  const rgb = channels(hex);
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return max === 0 ? 0 : (max - min) / max;
}

function shorter(from, to) {
  return Math.abs(((to - from + 540) % 360) - 180);
}

test('the first colors are muted blue, red, and green', () => {
  const [blue, red, green] = [0, 1, 2].map((index) => paletteColor(index));
  const [b, r, g] = [blue, red, green].map(channels);
  assert.ok(b[2] > b[0] && b[2] > b[1], blue);
  assert.ok(r[0] > r[1] && r[0] > r[2], red);
  assert.ok(g[1] > g[0] && g[1] > g[2], green);
  for (const hex of [blue, red, green]) {
    const amount = saturation(hex);
    assert.ok(amount > 0.28 && amount < 0.7, `${hex} saturation ${amount}`);
  }
});

test('each later color sits halfway between two earlier ones', () => {
  const hues = hueSequence(12);
  const seeds = hues.slice(0, 3);
  for (const mid of hues.slice(3)) {
    const distances = seeds.concat(hues.slice(0, hues.indexOf(mid)))
      .map((hue) => shorter(hue, mid))
      .sort((a, b) => a - b);
    assert.ok(Math.abs(distances[0] - distances[1]) < 1, `${mid} from ${distances[0]} and ${distances[1]}`);
  }
});

test('a link keeps its color when new links appear', () => {
  const first = assignColorIndices(['ab12|cd34', 'ab12|ef56'], {});
  assert.deepEqual(first, { 'ab12|cd34': 0, 'ab12|ef56': 1 });
  const second = assignColorIndices(['ab12|ef56', 'cd34|ef56', 'ab12|cd34'], first);
  assert.equal(second['ab12|cd34'], 0);
  assert.equal(second['ab12|ef56'], 1);
  assert.equal(second['cd34|ef56'], 2);
  assert.equal(paletteColor(0), colorForLink('cd34', 'ab12', second));
  assert.equal(paletteColor(0), colorForLink('ab12', 'cd34', second));
});

test('the hop with this radio is grey', () => {
  assert.equal(pairKey('ab12', null), null);
  assert.equal(pairKey(null, 'ab12'), null);
  assert.equal(colorForLink('ab12', null, {}), LOCAL_GREY);
  assert.equal(colorForLink(null, 'ab12', {}), LOCAL_GREY);
});

test('saved color slots drop junk', () => {
  const state = sanitizeState({ colorIndex: { 'ab12|cd34': 2, bad: -1, nope: 1.5 } });
  assert.deepEqual(state.colorIndex, { 'ab12|cd34': 2 });
});
