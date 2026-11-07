import { sanitizeState, STORAGE_KEY } from './store.js';

export function dumpStorage(storage) {
  const dump = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key == null) continue;
    const raw = storage.getItem(key);
    if (raw == null) continue;
    try {
      dump[key] = JSON.parse(raw);
    } catch {
      dump[key] = raw;
    }
  }
  return dump;
}

function isBackup(dump) {
  return !!dump && typeof dump === 'object' && !Array.isArray(dump);
}

export function readBackup(dump) {
  if (!isBackup(dump)) throw new Error('That file is not a meshpath backup.');
  const wrapped = dump[STORAGE_KEY];
  const bare = Array.isArray(dump.samples) || Array.isArray(dump.targets);
  if (wrapped && typeof wrapped === 'object') return sanitizeState(wrapped);
  if (bare) return sanitizeState(dump);
  throw new Error('That file has no meshpath data.');
}

function hopKey(hops) {
  return (hops || []).map((hop) => String(hop).toLowerCase()).join(',');
}

function sampleKey(sample) {
  const path = Array.isArray(sample.sent) ? sample.sent.map((hop) => String(hop).toLowerCase()).join(',') : '';
  if (path) return `${sample.t}|${path}`;
  return `${sample.t}|${sample.targetId}`;
}

// Add the file onto what this browser already has. Same path stays one target, and a trace already saved is left as it is.
export function mergeState(current, incoming) {
  const hasCurrent = !!current && typeof current === 'object';
  const base = sanitizeState(hasCurrent ? current : incoming);
  const extra = sanitizeState(incoming);

  const targets = base.targets.map((target) => ({ ...target, hops: [...target.hops] }));
  const byHops = new Map(targets.filter((target) => target.hops.length).map((target) => [hopKey(target.hops), target]));
  const usedIds = new Set(targets.map((target) => target.id));
  const idMap = new Map();

  for (const target of extra.targets) {
    if (!target.hops.length) continue;
    const key = hopKey(target.hops);
    const existing = byHops.get(key);
    if (existing) {
      idMap.set(target.id, existing.id);
      continue;
    }
    let id = target.id;
    while (usedIds.has(id)) id = `${id}-2`;
    const copy = { id, enabled: target.enabled, hops: [...target.hops] };
    targets.push(copy);
    usedIds.add(id);
    byHops.set(key, copy);
    idMap.set(target.id, id);
  }

  const samples = base.samples.map((sample) => ({ ...sample }));
  const seen = new Set(samples.map(sampleKey));
  for (const sample of extra.samples) {
    const key = sampleKey(sample);
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push({ ...sample, targetId: idMap.get(sample.targetId) || sample.targetId });
  }
  samples.sort((a, b) => a.t - b.t);

  const breaks = [...new Set([...base.breaks, ...extra.breaks])].sort((a, b) => a - b);
  const selfName = base.selfName && base.selfName !== 'me' ? base.selfName : (extra.selfName || base.selfName);

  return sanitizeState({
    ...base,
    targets,
    samples,
    breaks,
    names: { ...extra.names, ...base.names },
    visibility: { ...extra.visibility, ...base.visibility },
    colorIndex: { ...extra.colorIndex, ...base.colorIndex },
    selfName,
  });
}

export function restoreBackup(dump, storage) {
  const incoming = readBackup(dump);
  let current = null;
  if (storage) {
    try {
      current = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    } catch {
      current = null;
    }
  }
  const state = mergeState(current, incoming);
  if (storage && isBackup(dump) && dump[STORAGE_KEY] && typeof dump[STORAGE_KEY] === 'object') {
    for (const [key, value] of Object.entries(dump)) {
      if (key === STORAGE_KEY || storage.getItem(key) != null) continue;
      storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }
  if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}
