function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(random, center, spread) {
  return Math.round((center + (random() - 0.5) * spread) * 4) / 4;
}

function keyFromPrefix(hex) {
  const bytes = new Array(32).fill(0);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// Two paths, three runs, 100 traces. Shown only when nothing is saved and the radio is off.
export function sampleBoard(now = Date.now()) {
  const random = mulberry32(0x436f7265);
  const targets = [
    { id: 'sample-nova', enabled: true, hops: ['2b7e', '164a'] },
    { id: 'sample-paldiski', enabled: true, hops: ['2b7e', 'd34d'] },
  ];
  const names = { '2b7e': 'ES2KRT', '164a': 'Nova', d34d: 'Paldiski' };
  const count = 100;
  const sizes = [34, 33, 33];
  const step = 30_000;
  const gap = 40 * 60 * 1000;
  const span = (count - sizes.length) * step + (sizes.length - 1) * gap;
  const samples = [];
  const breaks = [];
  let cursor = now - span;
  let index = 0;
  for (let session = 0; session < sizes.length; session += 1) {
    for (let n = 0; n < sizes[session]; n += 1) {
      const target = targets[index % targets.length];
      const timeout = index % 13 === 7;
      const sent = [target.hops[0], target.hops[1], target.hops[0]];
      const far = target.id === 'sample-nova' ? -6 : -11;
      samples.push({
        t: cursor,
        targetId: target.id,
        outboundCount: 2,
        sent,
        snrs: timeout ? null : [jitter(random, 12, 2), jitter(random, far, 6), jitter(random, -4, 4)],
        lastSnr: timeout ? null : jitter(random, 11, 3),
        error: timeout ? 'timeout' : null,
      });
      index += 1;
      cursor += step;
    }
    if (session < sizes.length - 1) {
      const last = cursor - step;
      breaks.push(last + Math.floor(gap / 2));
      cursor = last + gap;
    }
  }

  const contacts = [
    ['ES2KRT', '2b7e', now / 1000 - 60],
    ['Nova', '164a', now / 1000 - 180],
    ['Paldiski', 'd34d', now / 1000 - 400],
    ['Harbour', 'ab12', now / 1000 - 3600],
    ['Hill', 'cd34', 0],
  ].map(([name, prefix, lastAdvert]) => ({
    name,
    publicKey: keyFromPrefix(prefix),
    outPath: [],
    outPathLen: 0xff,
    lastAdvert,
  }));

  return {
    intervalSec: 30,
    hashBytes: 2,
    selfName: 'companion',
    names,
    targets,
    samples,
    breaks,
    contacts,
  };
}
