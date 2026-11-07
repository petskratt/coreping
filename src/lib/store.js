import { keepNames, usedPrefixes } from './names.js';

export const STORAGE_KEY = 'meshpath.v1';
export const SAMPLE_CAP = 4000;

export const INTERVAL_CHOICES = [15, 30, 60, 300, 600, 900];
export const DURATION_CHOICES = [4, 8, 12, 24, 48].map((hours) => hours * 3600);
export const PATH_STEP_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8];
export const DEFAULT_INTERVAL_SEC = 60;
export const DEFAULT_HASH_BYTES = 2;
export const DEFAULT_DURATION_SEC = 4 * 3600;
export const DEFAULT_PATH_STEPS = 4;
// A round never starts an 11th trace. Not a setting.
export const MAX_CONCURRENT_TRACES = 10;
const LONG_RUN_SEC = 4 * 3600;
const LONG_RUN_MIN_INTERVAL = 5 * 60;

// A run longer than 4 hours cannot ping faster than every 5 minutes.
export function clampTraceLimits(intervalSec, maxDurationSec) {
  const maxDuration = DURATION_CHOICES.includes(maxDurationSec) ? maxDurationSec : DEFAULT_DURATION_SEC;
  let interval = INTERVAL_CHOICES.includes(intervalSec) ? intervalSec : DEFAULT_INTERVAL_SEC;
  if (maxDuration > LONG_RUN_SEC && interval < LONG_RUN_MIN_INTERVAL) interval = LONG_RUN_MIN_INTERVAL;
  return { intervalSec: interval, maxDurationSec: maxDuration };
}

export function durationHoursLabel(seconds) {
  const hours = seconds / 3600;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export function pathStepsOf(value) {
  return PATH_STEP_CHOICES.includes(value) ? value : DEFAULT_PATH_STEPS;
}

// Forward nodes only. The return walk is added later and does not count.
export function clipForwardHops(hops, pathSteps) {
  return (hops || []).slice(0, pathStepsOf(pathSteps));
}

export function defaultState() {
  return {
    intervalSec: DEFAULT_INTERVAL_SEC,
    hashBytes: DEFAULT_HASH_BYTES,
    maxDurationSec: DEFAULT_DURATION_SEC,
    pathSteps: DEFAULT_PATH_STEPS,
    roundTrip: true,
    targets: [],
    samples: [],
    breaks: [],
    visibility: {},
    colorIndex: {},
    names: {},
    selfName: 'me',
  };
}

export function sanitizeState(raw) {
  const state = defaultState();
  if (!raw || typeof raw !== 'object') return state;

  const limits = clampTraceLimits(raw.intervalSec, raw.maxDurationSec);
  state.intervalSec = limits.intervalSec;
  state.maxDurationSec = limits.maxDurationSec;
  state.pathSteps = pathStepsOf(raw.pathSteps);
  if (raw.hashBytes === 1 || raw.hashBytes === 2 || raw.hashBytes === 4) {
    state.hashBytes = raw.hashBytes;
  }
  if (typeof raw.roundTrip === 'boolean') state.roundTrip = raw.roundTrip;

  if (Array.isArray(raw.targets)) {
    state.targets = raw.targets
      .filter((target) => target && typeof target.id === 'string' && Array.isArray(target.hops))
      .map((target) => ({
        id: target.id,
        enabled: target.enabled !== false,
        hops: clipForwardHops(target.hops.filter((hop) => typeof hop === 'string'), state.pathSteps),
      }));
  }

  if (Array.isArray(raw.samples)) {
    state.samples = raw.samples
      .filter((sample) => sample && typeof sample.t === 'number' && typeof sample.targetId === 'string')
      .slice(-SAMPLE_CAP);
  }

  if (Array.isArray(raw.breaks)) {
    state.breaks = raw.breaks.filter((value) => typeof value === 'number' && Number.isFinite(value));
  }

  if (raw.colorIndex && typeof raw.colorIndex === 'object') {
    for (const [key, value] of Object.entries(raw.colorIndex)) {
      if (typeof key === 'string' && Number.isInteger(value) && value >= 0) state.colorIndex[key] = value;
    }
  }

  if (raw.visibility && typeof raw.visibility === 'object') {
    for (const [key, value] of Object.entries(raw.visibility)) {
      if (typeof value === 'boolean') state.visibility[key] = value;
    }
  }

  state.names = keepNames(raw.names, usedPrefixes(state.targets, state.samples));
  if (typeof raw.selfName === 'string' && raw.selfName.trim()) state.selfName = raw.selfName.trim();

  return state;
}

export function appendSamples(existing, extra) {
  return [...existing, ...extra].slice(-SAMPLE_CAP);
}

export function loadState() {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  if (typeof localStorage === 'undefined') return;
  const clean = sanitizeState(state);
  clean.samples = appendSamples([], clean.samples);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}
