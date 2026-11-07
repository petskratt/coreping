// File names only get basic ASCII. Accents fold, emoji and the rest are dropped.
export function asciiSlug(text) {
  const folded = String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  return folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// coreping-nova-paldiski_2026-11-07-20-46-19
export function exportBaseName(targets, nameOf, stamp) {
  const parts = [];
  for (const target of targets || []) {
    const hops = target?.hops || [];
    const last = hops[hops.length - 1];
    if (!last) continue;
    const slug = asciiSlug(nameOf(last)) || asciiSlug(last);
    if (slug) parts.push(slug);
  }
  return `coreping-${parts.length ? parts.join('-') : 'trace'}_${stamp}`;
}
