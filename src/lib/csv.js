import { formatLoss, formatSnr, formatTimestamp } from './stats.js';

function csvField(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function csvRow(cells) {
  return cells.map(csvField).join(',');
}

export function binLabel(from, bucket = 2) {
  return `${from}..${from + bucket}`;
}

export function binStarts(histograms, bucket = 2) {
  let min = Infinity;
  let max = -Infinity;
  for (const bins of histograms) {
    for (const bin of bins || []) {
      if (bin.from < min) min = bin.from;
      if (bin.from > max) max = bin.from;
    }
  }
  if (!Number.isFinite(min)) return [];
  const starts = [];
  for (let from = min; from <= max; from += bucket) starts.push(from);
  return starts;
}

function countIn(histogram, from) {
  return histogram.find((bin) => bin.from === from)?.count || 0;
}

export function buildCsv(summaryRows, sampleRows) {
  const starts = binStarts(summaryRows.map((row) => row.summary?.histogram));
  const summaryHeader = ['hop', 'n', 'loss', 'min', 'avg', 'max', 'stdev', ...starts.map((from) => binLabel(from))];
  const summaryLines = [csvRow(summaryHeader)];
  for (const row of summaryRows) {
    const summary = row.summary;
    summaryLines.push(csvRow([
      row.label,
      summary?.count ?? 0,
      formatLoss(summary?.loss),
      formatSnr(summary?.min),
      formatSnr(summary?.avg),
      formatSnr(summary?.max),
      formatSnr(summary?.stdev),
      ...starts.map((from) => countIn(summary?.histogram || [], from)),
    ]));
  }

  const sampleLines = [csvRow(['timestamp', 'target', 'path', 'hop', 'direction', 'snr'])];
  const ordered = [...sampleRows].sort((a, b) => a.t - b.t || a.hopIndex - b.hopIndex);
  for (const row of ordered) {
    sampleLines.push(csvRow([
      formatTimestamp(row.t),
      row.target,
      row.path,
      row.hop,
      row.direction,
      formatSnr(row.snr),
    ]));
  }

  return `${summaryLines.join('\n')}\n\n${sampleLines.join('\n')}\n`;
}
