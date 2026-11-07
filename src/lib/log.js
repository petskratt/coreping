import { formatSnr, formatTimestamp } from './stats.js';

export function tracingLine(sent, nameOf) {
  const path = sent.map((hop) => nameOf(hop)).join(' -> ');
  return `Tracing ${path}...`;
}

export function completedLine(sample, nameOf) {
  const when = formatTimestamp(sample.t);
  const path = (sample.sent || []).map((hop) => nameOf(hop)).join(' -> ');
  if (sample.error || !sample.snrs) {
    return `${when}  ${path}  ${sample.error || 'no reply'}`;
  }
  const parts = sample.snrs.map((snr) => formatSnr(snr));
  if (typeof sample.lastSnr === 'number') parts.push(`local ${formatSnr(sample.lastSnr)}`);
  return `${when}  ${path}  ${parts.join(', ')} dB`;
}
