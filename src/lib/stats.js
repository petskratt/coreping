export function histogram(values, bucket = 2) {
  const bins = new Map();
  for (const value of values) {
    const from = Math.floor(value / bucket) * bucket;
    bins.set(from, (bins.get(from) || 0) + 1);
  }
  return [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([from, count]) => ({ from, to: from + bucket, count }));
}

export function standardDeviation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const square = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(square / (values.length - 1));
}

export function summarize(values, bucket = 2) {
  const points = values.map((value) => (
    value != null && typeof value === 'object' ? value : { snr: value }
  ));
  if (!points.length) return null;

  const numbers = [];
  let losses = 0;
  for (const point of points) {
    if (typeof point.snr === 'number' && Number.isFinite(point.snr)) numbers.push(point.snr);
    else losses += 1;
  }

  let min = null;
  let max = null;
  let sum = 0;
  for (const value of numbers) {
    if (min == null || value < min) min = value;
    if (max == null || value > max) max = value;
    sum += value;
  }

  return {
    min,
    max,
    avg: numbers.length ? sum / numbers.length : null,
    stdev: standardDeviation(numbers),
    count: numbers.length,
    attempts: points.length,
    loss: losses / points.length,
    histogram: histogram(numbers, bucket),
  };
}

export function numericSnrs(values) {
  const numbers = [];
  for (const point of values) {
    if (typeof point?.snr === 'number' && Number.isFinite(point.snr)) numbers.push(point.snr);
  }
  return numbers;
}

export function formatSnr(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function formatLoss(ratio) {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '';
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatTimestamp(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
