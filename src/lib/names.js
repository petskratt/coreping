import { prefixHex } from './path.js';

const HEX = /^[0-9a-f]+$/;

// Prefixes that show up on a target or in a trace. Anything else is not a contact we need to remember.
export function usedPrefixes(targets, samples) {
  const seen = new Set();
  const prefixes = [];
  const add = (hop) => {
    if (typeof hop !== 'string' || !hop) return;
    const prefix = hop.toLowerCase();
    if (seen.has(prefix)) return;
    seen.add(prefix);
    prefixes.push(prefix);
  };
  for (const target of targets || []) {
    for (const hop of target?.hops || []) add(hop);
  }
  for (const sample of samples || []) {
    for (const hop of sample?.sent || []) add(hop);
  }
  return prefixes;
}

export function keepNames(raw, prefixes) {
  const allowed = new Set(prefixes);
  const names = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return names;
  for (const [key, value] of Object.entries(raw)) {
    const prefix = key.trim().toLowerCase();
    if (!allowed.has(prefix) || !HEX.test(prefix)) continue;
    const width = prefix.length / 2;
    if (width !== 1 && width !== 2 && width !== 4) continue;
    if (typeof value !== 'string') continue;
    const name = value.trim();
    if (!name) continue;
    names[prefix] = name;
  }
  return names;
}

function matches(contact, prefix) {
  const width = prefix.length / 2;
  if (!contact?.publicKey || contact.publicKey.length < width) return false;
  return prefixHex(contact.publicKey, width) === prefix;
}

// A unique contact replaces the stored name. No unique match keeps the name
// from the trace, so opening the file later still labels the graph.
export function refreshNames(stored, contacts, prefixes) {
  const source = stored && typeof stored === 'object' ? stored : {};
  const next = {};
  for (const prefix of prefixes) {
    const key = String(prefix).toLowerCase();
    const hits = (contacts || []).filter((contact) => matches(contact, key));
    if (hits.length === 1) {
      const name = String(hits[0].name || '').trim();
      if (name) {
        next[key] = name;
        continue;
      }
    }
    const previous = typeof source[key] === 'string' ? source[key].trim() : '';
    if (previous) next[key] = previous;
  }
  return next;
}
