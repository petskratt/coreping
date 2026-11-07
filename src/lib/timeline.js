// A stop/start is a cut in the trace, not a stretch of empty chart.
// Times on either side of a break stay in real order inside their own run,
// and the idle gap between runs is left out of the scale.

export function splitSessions(times, breaks = []) {
  const marks = breaks
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);
  const sorted = times
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);

  const segments = [];
  let current = [];
  let mark = 0;
  for (const t of sorted) {
    let crossed = false;
    while (mark < marks.length && marks[mark] < t) {
      crossed = true;
      mark += 1;
    }
    if (crossed && current.length) {
      segments.push(current);
      current = [];
    }
    current.push(t);
  }
  if (current.length) segments.push(current);
  return segments;
}

export function pointsAreSeparated(t1, t2, breaks = []) {
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  return breaks.some((value) => typeof value === 'number' && lo < value && value < hi);
}

// A hole much longer than the scan interval is time nobody was tracing.
// Used only to draw the chart. It is not written back into the saved samples.
export function impliedBreaks(times, explicit = [], intervalMs = 60_000, factor = 4) {
  const unique = [];
  for (const value of [...times].sort((a, b) => a - b)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (!unique.length || unique[unique.length - 1] !== value) unique.push(value);
  }
  if (!(intervalMs > 0) || unique.length < 2) return [];
  const limit = intervalMs * factor;
  const marks = [];
  for (let i = 1; i < unique.length; i++) {
    const prev = unique[i - 1];
    const next = unique[i];
    if (next - prev <= limit) continue;
    if (explicit.some((mark) => prev < mark && mark < next)) continue;
    marks.push(prev + Math.floor((next - prev) / 2));
  }
  return marks;
}

// plotWidth is the drawable width in px. Each run gets at least `minPx`,
// and runs are separated by `gapPx` where the chart draws the gray line.
export function layoutSessions(times, breaks = [], plotWidth, gapPx = 16, minPx = 24) {
  const segments = splitSessions(times, breaks).map((group) => ({
    start: group[0],
    end: group[group.length - 1],
  }));
  if (!segments.length || !(plotWidth > 0)) return null;

  const gapCount = Math.max(0, segments.length - 1);
  const usable = Math.max(plotWidth - gapCount * gapPx, segments.length * minPx);
  const extra = usable - segments.length * minPx;
  const durations = segments.map((segment) => Math.max(segment.end - segment.start, 0));
  const sum = durations.reduce((total, duration) => total + duration, 0);

  let x = 0;
  const placed = segments.map((segment, index) => {
    const share = sum === 0 ? 1 / segments.length : durations[index] / sum;
    const width = minPx + extra * share;
    const box = { start: segment.start, end: segment.end, x0: x, x1: x + width };
    x += width + gapPx;
    return box;
  });

  const dividers = [];
  for (let i = 1; i < placed.length; i++) {
    dividers.push(placed[i - 1].x1 + gapPx / 2);
  }

  function xOf(t) {
    for (const box of placed) {
      if (t >= box.start && t <= box.end) {
        if (box.start === box.end) return (box.x0 + box.x1) / 2;
        return box.x0 + ((t - box.start) / (box.end - box.start)) * (box.x1 - box.x0);
      }
    }
    if (t < placed[0].start) return placed[0].x0;
    return placed[placed.length - 1].x1;
  }

  return { placed, dividers, xOf };
}

const LABEL_STEPS = [
  60_000,
  2 * 60_000,
  5 * 60_000,
  10 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
  2 * 60 * 60_000,
  3 * 60 * 60_000,
  6 * 60 * 60_000,
  12 * 60 * 60_000,
  24 * 60 * 60_000,
  2 * 24 * 60 * 60_000,
  7 * 24 * 60 * 60_000,
];

function labelWidth(span, rem) {
  return (span > 24 * 60 * 60 * 1000 ? 7.4 : 3.6) * rem;
}

// Start and end of every run, plus round times in between when they fit.
export function segmentLabels(segment, rem) {
  const { start, end, x0, x1 } = segment;
  const span = Math.max(end - start, 0);
  const width = Math.max(x1 - x0, 0);
  const text = labelWidth(span, rem);
  if (span === 0 || width < text * 1.4) {
    return [{ x: (x0 + x1) / 2, t: start, anchor: 'middle', span }];
  }

  const ends = [
    { x: x0, t: start, anchor: 'start', span },
    { x: x1, t: end, anchor: 'end', span },
  ];
  const minGap = text * 1.15;
  const innerLeft = x0 + text;
  const innerRight = x1 - text;
  if (innerRight - innerLeft < minGap) return ends;

  const xAt = (t) => x0 + ((t - start) / span) * width;
  for (const step of LABEL_STEPS) {
    const first = Math.ceil((start + 1) / step) * step;
    const marks = [];
    for (let t = first; t < end; t += step) {
      const x = xAt(t);
      if (x < innerLeft || x > innerRight) continue;
      marks.push({ x, t, anchor: 'middle', span });
    }
    if (marks.length === 0) continue;
    const spaced = marks.every((mark, index) => index === 0 || mark.x - marks[index - 1].x >= minGap);
    if (spaced) return [ends[0], ...marks, ends[1]];
  }
  return ends;
}

export function chartLabels(placed, rem) {
  return placed.flatMap((segment) => segmentLabels(segment, rem));
}
