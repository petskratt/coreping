<script>
  import { strokeDash } from '../lib/series.js';
  import { chartLabels, impliedBreaks, layoutSessions, pointsAreSeparated } from '../lib/timeline.js';

  let { series = [], breaks = [], intervalMs = 60_000 } = $props();

  let frameWidth = $state(0);
  let frameHeight = $state(0);

  const metrics = $derived.by(() => {
    const rem = typeof document === 'undefined'
      ? 16
      : (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    const width = frameWidth;
    const height = frameHeight;
    const pad = {
      l: 3.4 * rem,
      r: 0.6 * rem,
      t: 0.45 * rem,
      b: 1.5 * rem,
    };
    return { rem, width, height, pad, plotW: width - pad.l - pad.r };
  });

  const plotTimes = $derived.by(() => {
    const times = [];
    for (const line of series) {
      for (const point of line.values) times.push(point.t);
    }
    return times;
  });

  const hasSamples = $derived(series.some((line) => line.values.some((point) => typeof point.snr === 'number')));

  const cuts = $derived([...breaks, ...impliedBreaks(plotTimes, breaks, intervalMs)]);

  const layout = $derived(layoutSessions(plotTimes, cuts, metrics.plotW));

  const yBox = $derived.by(() => {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const line of series) {
      for (const point of line.values) {
        if (typeof point.snr !== 'number') continue;
        if (point.snr < y0) y0 = point.snr;
        if (point.snr > y1) y1 = point.snr;
      }
    }
    if (!Number.isFinite(y0)) return null;
    if (y0 === y1) {
      y0 -= 1;
      y1 += 1;
    }
    const yPad = (y1 - y0) * 0.12;
    return { y0: y0 - yPad, y1: y1 + yPad };
  });

  const yTicks = $derived.by(() => {
    if (!yBox) return [];
    const count = 10;
    return Array.from({ length: count }, (_, index) => {
      return yBox.y0 + ((yBox.y1 - yBox.y0) * index) / (count - 1);
    });
  });

  const xLabels = $derived(layout ? chartLabels(layout.placed, metrics.rem) : []);

  function xPx(t) {
    return metrics.pad.l + layout.xOf(t);
  }

  function yOf(value) {
    const box = yBox;
    const { pad, height } = metrics;
    return pad.t + ((box.y1 - value) / (box.y1 - box.y0)) * (height - pad.t - pad.b);
  }

  function linePath(values) {
    const ordered = [...values].sort((a, b) => a.t - b.t);
    let d = '';
    let drawing = false;
    let prev = null;
    for (const point of ordered) {
      if (typeof point.snr !== 'number') {
        drawing = false;
        prev = point;
        continue;
      }
      const cut = prev != null && pointsAreSeparated(prev.t, point.t, cuts);
      d += `${drawing && !cut ? 'L' : 'M'}${xPx(point.t).toFixed(1)},${yOf(point.snr).toFixed(1)}`;
      drawing = true;
      prev = point;
    }
    return d;
  }

  function formatClock(t, span) {
    const date = new Date(t);
    if (span > 24 * 60 * 60 * 1000) {
      return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="chart-frame" bind:clientWidth={frameWidth} bind:clientHeight={frameHeight}>
  {#if !hasSamples}
    <p class="empty">No samples yet. Connect and start, or load the preview.</p>
  {:else if layout && yBox && metrics.width > 0}
    <svg
      class="chart"
      viewBox="0 0 {metrics.width} {metrics.height}"
      preserveAspectRatio="none"
      role="img"
      aria-label="SNR over time"
    >
      {#each yTicks as tick (tick)}
        <line class="grid" x1={metrics.pad.l} x2={metrics.width - metrics.pad.r} y1={yOf(tick)} y2={yOf(tick)} />
        <text class="tick" x={metrics.pad.l - metrics.rem * 0.4} y={yOf(tick)} dy="0.32em" text-anchor="end">{tick.toFixed(1)}</text>
      {/each}
      {#each xLabels as tick, index (`${index}:${tick.t}`)}
        <text class="tick" y={metrics.height - metrics.rem * 0.4} x={metrics.pad.l + tick.x} text-anchor={tick.anchor}>{formatClock(tick.t, tick.span)}</text>
      {/each}
      {#each layout.dividers as x (x)}
        <line class="break" x1={metrics.pad.l + x} x2={metrics.pad.l + x} y1={metrics.pad.t} y2={metrics.height - metrics.pad.b}>
          <title>Scan stopped and started</title>
        </line>
      {/each}
      {#each series as line (line.key)}
        <path
          d={linePath(line.values)}
          fill="none"
          stroke={line.color}
          stroke-width="2"
          stroke-linecap="butt"
          stroke-linejoin="round"
          stroke-dasharray={strokeDash(line.style)}
        />
        {#each line.values as point, index (`${line.key}:${index}`)}
          {#if typeof point.snr === 'number'}
            <circle cx={xPx(point.t)} cy={yOf(point.snr)} r={metrics.rem * 0.14} fill={line.color}>
              <title>{point.snr.toFixed(2)} dB</title>
            </circle>
          {/if}
        {/each}
      {/each}
    </svg>
  {/if}
</div>
