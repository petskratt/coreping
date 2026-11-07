// Local hop (this radio is one end) is grey. Everything else takes the next
// slot in a fixed palette: blue, red, green, then the hue halfway between
// each pair already chosen. Slots are remembered, so a link does not change
// color when a run starts again or a new link shows up.

export const LOCAL_GREY = '#8d939c';

const SEEDS = [250, 25, 145];
const PALETTE_SIZE = 24;
const LIGHTNESS = 0.58;
const CHROMA = 0.11;

function shorterDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function lerpHue(from, to) {
  return (from + shorterDelta(from, to) / 2 + 360) % 360;
}

export function hueSequence(count) {
  const hues = SEEDS.slice(0, count);
  while (hues.length < count) {
    const ring = [...hues].sort((a, b) => a - b);
    const start = ring.indexOf(hues[0]);
    const room = count - hues.length;
    const batch = Math.min(ring.length, room);
    for (let step = 0; step < batch; step++) {
      const from = ring[(start + step) % ring.length];
      const to = ring[(start + step + 1) % ring.length];
      hues.push(lerpHue(from, to));
    }
  }
  return hues;
}

function linearSrgb(lightness, chroma, hue) {
  const radians = hue * Math.PI / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function gamma(channel) {
  const value = Math.min(Math.max(channel, 0), 1);
  const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(encoded, 0), 1) * 255);
}

function inGamut(channels) {
  return channels.every((channel) => channel >= -0.001 && channel <= 1.001);
}

function hexFromOklch(lightness, chroma, hue) {
  let amount = chroma;
  let linear = linearSrgb(lightness, amount, hue);
  while (amount > 0.04 && !inGamut(linear)) {
    amount -= 0.005;
    linear = linearSrgb(lightness, amount, hue);
  }
  const [red, green, blue] = linear.map(gamma);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

const HUES = hueSequence(PALETTE_SIZE);
const PALETTE = HUES.map((hue) => hexFromOklch(LIGHTNESS, CHROMA, hue));

export function paletteColor(index) {
  return PALETTE[index % PALETTE.length];
}

export function pairKey(hearerHex, prevHex) {
  if (hearerHex == null || prevHex == null) return null;
  return [hearerHex, prevHex].sort().join('|');
}

export function remotePairKeys(lines) {
  const keys = [];
  const seen = new Set();
  for (const line of lines) {
    const key = pairKey(line.hearerHex, line.prevHex);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function assignColorIndices(pairKeys, saved = {}) {
  const map = {};
  for (const [key, value] of Object.entries(saved)) {
    if (typeof key === 'string' && Number.isInteger(value) && value >= 0) map[key] = value;
  }
  let next = 0;
  for (const value of Object.values(map)) {
    if (value >= next) next = value + 1;
  }
  for (const key of pairKeys) {
    if (!key || map[key] != null) continue;
    map[key] = next;
    next += 1;
  }
  return map;
}

export function colorForLink(hearerHex, prevHex, colorIndex) {
  const key = pairKey(hearerHex, prevHex);
  if (!key) return LOCAL_GREY;
  return paletteColor(colorIndex?.[key] ?? 0);
}
