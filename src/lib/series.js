import { expandRoundTrip } from './path.js';

// One directed radio link, whoever's trace it showed up in.
// Null is this companion: "ab12>*" is the repeater hearing us.
export function linkKey(hearerHex, prevHex) {
  return `${hearerHex ?? '*'}>${prevHex ?? '*'}`;
}

// Solid is the way out, dashed is the way back. The local hop uses the same pair.
export function linkStyle(dir) {
  return dir === 'out' ? 'solid' : 'dashed';
}

export function strokeDash(style) {
  return style === 'dashed' ? '8 5' : null;
}

// snrs[i] is how well sent[i] heard the previous transmitter.
// Index 0 is the first hop hearing this companion. lastSnr is this companion
// hearing whoever transmitted the finished trace. On a multi-hop path those two
// are the local radio link, so they start hidden.
export function describeTrace({ targetId, outboundCount, sent, snrs, lastSnr }) {
  const points = [];
  for (let i = 0; i < snrs.length; i++) {
    const dir = i < outboundCount ? 'out' : 'back';
    const hearerHex = sent[i] ?? null;
    const prevHex = i === 0 ? null : (sent[i - 1] ?? null);
    points.push({
      key: linkKey(hearerHex, prevHex),
      targetId,
      hopIndex: i,
      dir,
      style: linkStyle(dir),
      snr: snrs[i],
      hearerHex,
      prevHex,
      hiddenByDefault: outboundCount >= 2 && i === 0,
    });
  }
  const hearerHex = null;
  const prevHex = sent.length ? sent[sent.length - 1] : null;
  points.push({
    key: linkKey(hearerHex, prevHex),
    targetId,
    hopIndex: snrs.length,
    dir: 'local',
    style: linkStyle('local'),
    snr: lastSnr,
    hearerHex,
    prevHex,
    hiddenByDefault: outboundCount >= 2,
  });
  return points;
}

export function isVisible(series, overrides) {
  if (Object.prototype.hasOwnProperty.call(overrides, series.key)) {
    return overrides[series.key];
  }
  return !series.hiddenByDefault;
}

export function seriesLabel(series, nameOf) {
  const hearer = series.hearerHex == null ? nameOf(null) : nameOf(series.hearerHex);
  const prev = series.prevHex == null ? nameOf(null) : nameOf(series.prevHex);
  return `${hearer} heard ${prev}`;
}

function blankTrace(target) {
  const sent = expandRoundTrip(target.hops);
  return describeTrace({
    targetId: target.id,
    outboundCount: target.hops.length,
    sent,
    snrs: sent.map(() => null),
    lastSnr: null,
  });
}

export function buildSeries(targets, samples) {
  const byKey = new Map();

  const ensure = (point) => {
    let series = byKey.get(point.key);
    if (!series) {
      series = {
        key: point.key,
        dir: point.dir,
        style: linkStyle(point.dir),
        hiddenByDefault: point.hiddenByDefault,
        hearerHex: point.hearerHex,
        prevHex: point.prevHex,
        values: [],
      };
      byKey.set(point.key, series);
      return series;
    }
    // Show the link if any target treats it as a measurement, not only as the local leg.
    if (!point.hiddenByDefault) series.hiddenByDefault = false;
    return series;
  };

  const remember = (series, sample, point) => {
    series.values.push({
      t: sample.t,
      snr: point.snr,
      targetId: sample.targetId,
      dir: point.dir,
      hopIndex: point.hopIndex,
    });
  };

  for (const target of targets) {
    if (!target.hops?.length) continue;
    for (const point of blankTrace(target)) ensure(point);
  }

  const ordered = [...samples].sort((a, b) => a.t - b.t);
  for (const sample of ordered) {
    if (sample.error || !sample.snrs) {
      const sent = Array.isArray(sample.sent) ? sample.sent : [];
      if (!sent.length) continue;
      const missed = describeTrace({
        targetId: sample.targetId,
        outboundCount: sample.outboundCount ?? sent.length,
        sent,
        snrs: sent.map(() => null),
        lastSnr: null,
      });
      for (const point of missed) remember(ensure(point), sample, point);
      continue;
    }
    for (const point of describeTrace(sample)) remember(ensure(point), sample, point);
  }

  return [...byKey.values()];
}
