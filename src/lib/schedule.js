// The interval is a minimum gap between round starts, not a pause after the round ends.
// A round that starts at :05 and finishes at :10 next starts at :20 when the interval is 15s.
// If the round runs longer than the interval, the wait is zero and the next round starts at once.
export function waitAfterRound(startedAt, now, intervalMs) {
  return Math.max(0, intervalMs - (now - startedAt));
}

export function runLimitReached(startedAt, now, maxDurationSec) {
  return now - startedAt >= maxDurationSec * 1000;
}

export function waitingLine(msLeft) {
  const seconds = Math.max(1, Math.ceil(msLeft / 1000));
  return `waiting ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

// A looping silent buffer keeps Chrome from clamping background timers to a minute.
// It does not survive the machine sleeping, or a phone freezing the tab.
export function startKeepAlive() {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) return { stop() {} };

  const ctx = new AudioCtx();
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(ctx.destination);
  source.start();
  ctx.resume().catch(() => {});

  return {
    stop() {
      try { source.stop(); } catch { /* already stopped */ }
      ctx.close().catch(() => {});
    },
  };
}
