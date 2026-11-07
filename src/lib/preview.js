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

export function previewSession(now = Date.now()) {
  const random = mulberry32(0x4d455348);
  const count = 36;
  const step = 60_000;
  const pauseAt = 18;
  const pause = 30 * 60 * 1000;
  const start = now - (count - 1) * step - pause;
  const samples = [];
  const stamp = (i, offset = 0) => start + i * step + (i >= pauseAt ? pause : 0) + offset;

  for (let i = 0; i < count; i++) {
    const t = stamp(i);
    const repeater = {
      t,
      targetId: 'preview-repeater',
      outboundCount: 2,
      sent: ['ab12', 'cd34', 'ab12'],
      snrs: [jitter(random, 9, 2), jitter(random, -3, 5), jitter(random, 1.5, 3)],
      lastSnr: jitter(random, 8, 2),
      error: null,
    };
    if (i === 10) {
      repeater.snrs = null;
      repeater.lastSnr = null;
      repeater.error = 'timeout';
    }
    samples.push(repeater);
    samples.push({
      t: t + 1500,
      targetId: 'preview-direct',
      outboundCount: 1,
      sent: ['ef56'],
      snrs: [jitter(random, 4, 3)],
      lastSnr: jitter(random, 3, 3),
      error: null,
    });
    samples.push({
      t: t + 3000,
      targetId: 'preview-via',
      outboundCount: 2,
      sent: ['ab12', 'ef56', 'ab12'],
      snrs: [jitter(random, 9, 2), jitter(random, 2, 4), jitter(random, 1, 3)],
      lastSnr: jitter(random, 8, 2),
      error: null,
    });
  }

  return {
    intervalSec: 60,
    hashBytes: 2,
    roundTrip: true,
    breaks: [stamp(pauseAt - 1, step)],
    selfName: 'T-Echo',
    names: {
      ab12: 'Repeater',
      cd34: 'Far node',
      ef56: 'Neighbour',
    },
    targets: [
      { id: 'preview-repeater', hops: ['ab12', 'cd34'], enabled: true },
      { id: 'preview-via', hops: ['ab12', 'ef56'], enabled: true },
      { id: 'preview-direct', hops: ['ef56'], enabled: true },
    ],
    samples,
  };
}
