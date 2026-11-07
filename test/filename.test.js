import assert from 'node:assert/strict';
import test from 'node:test';
import { asciiSlug, exportBaseName } from '../src/lib/filename.js';

test('slugs keep basic ascii and drop emoji', () => {
  assert.equal(asciiSlug('ES2KRT'), 'es2krt');
  assert.equal(asciiSlug('Nova 🇪🇪'), 'nova');
  assert.equal(asciiSlug('Paldiski'), 'paldiski');
  assert.equal(asciiSlug('Far node'), 'far-node');
  assert.equal(asciiSlug('Äkkö'), 'akko');
  assert.equal(asciiSlug('🔥'), '');
});

test('export names use the last node of each target', () => {
  const names = { '164a': 'Nova 🇪🇪', d34d: 'Paldiski', '2b7e': 'ES2KRT' };
  const nameOf = (hop) => names[hop] || hop;
  const targets = [
    { hops: ['2b7e', '164a'] },
    { hops: ['2b7e', 'd34d'] },
  ];
  assert.equal(
    exportBaseName(targets, nameOf, '2026-11-07-20-46-19'),
    'coreping-nova-paldiski_2026-11-07-20-46-19',
  );
});

test('a target with no hops is skipped, and none at all is just trace', () => {
  assert.equal(exportBaseName([{ hops: [] }], () => '', 't'), 'coreping-trace_t');
  assert.equal(exportBaseName([], () => '', 't'), 'coreping-trace_t');
});
