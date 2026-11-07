import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendHops,
  expandRoundTrip,
  flagsForHashBytes,
  hopsFromSavedRoute,
  draftParts,
  parsePrefixList,
  prefixHex,
  takeReadyPrefixes,
  prefixesToBytes,
} from '../src/lib/path.js';

test('parses comma and space separated prefixes at the selected width', () => {
  assert.deepEqual(parsePrefixList(' AB12, cd34 ', 2), ['ab12', 'cd34']);
  assert.deepEqual(parsePrefixList('0xab', 1), ['ab']);
});

test('rejects 3-byte prefixes because trace width is a power of two', () => {
  assert.throws(() => parsePrefixList('abcdef', 2), /3 bytes/);
  assert.throws(() => parsePrefixList('abcdef', 2), /power of two/);
});

test('a trailing delimiter commits prefixes and leaves an unfinished one in the field', () => {
  assert.deepEqual(draftParts('ab12'), { ready: [], pending: 'ab12' });
  assert.deepEqual(draftParts('ab12,'), { ready: ['ab12'], pending: '' });
  assert.deepEqual(draftParts('ab12 '), { ready: ['ab12'], pending: '' });
  assert.deepEqual(draftParts('ab12, cd34'), { ready: ['ab12'], pending: 'cd34' });
  assert.deepEqual(draftParts('ab12,cd34,ef56'), { ready: ['ab12', 'cd34'], pending: 'ef56' });
  assert.deepEqual(draftParts('ab12,\ncd34\n'), { ready: ['ab12', 'cd34'], pending: '' });
  assert.deepEqual(draftParts('  '), { ready: [], pending: '' });
});

test('finished prefixes become hops, and a bad one stays editable', () => {
  assert.deepEqual(takeReadyPrefixes('ab12, cd34,', 2), { hops: ['ab12', 'cd34'], pending: '', error: null });
  assert.deepEqual(takeReadyPrefixes('0xab12, cd34', 2), { hops: ['ab12'], pending: 'cd34', error: null });
  const bad = takeReadyPrefixes('ab12, zz, cd34', 2);
  assert.deepEqual(bad.hops, ['ab12']);
  assert.equal(bad.pending, 'zz, cd34');
  assert.match(bad.error, /not hex/);
  const short = takeReadyPrefixes('ab,', 2);
  assert.deepEqual(short.hops, []);
  assert.equal(short.pending, 'ab');
  assert.match(short.error, /trace width is 2/);
});

test('rejects a prefix whose width does not match the trace', () => {
  assert.throws(() => parsePrefixList('ab', 2), /trace width is 2/);
  assert.throws(() => parsePrefixList('zz', 1), /not hex/);
});

test('flags are the shift for 1, 2, and 4 byte hashes', () => {
  assert.equal(flagsForHashBytes(1), 0);
  assert.equal(flagsForHashBytes(2), 1);
  assert.equal(flagsForHashBytes(4), 2);
  assert.throws(() => flagsForHashBytes(3), /1, 2, or 4/);
});

test('round trip appends the reverse path without repeating the far node', () => {
  assert.deepEqual(expandRoundTrip(['aa', 'bb', 'cc']), ['aa', 'bb', 'cc', 'bb', 'aa']);
  assert.deepEqual(expandRoundTrip(['aa']), ['aa']);
  assert.deepEqual(expandRoundTrip(['aa', 'bb', 'cc', 'bb', 'aa']), ['aa', 'bb', 'cc', 'bb', 'aa']);
});

test('a repeated node ends the path, and the hops after it are dropped', () => {
  assert.deepEqual(appendHops([], ['aa', 'bb', 'cc', 'bb', 'aa']), { hops: ['aa', 'bb', 'cc'], cutAt: 'bb' });
  assert.deepEqual(appendHops(['aa', 'bb'], ['cc']), { hops: ['aa', 'bb', 'cc'], cutAt: null });
  assert.deepEqual(appendHops(['aa'], ['aa', 'bb']), { hops: ['aa'], cutAt: 'aa' });
  assert.deepEqual(appendHops(['aa', 'bb'], ['cc', 'aa']), { hops: ['aa', 'bb', 'cc'], cutAt: 'aa' });
});

test('prefix bytes stay in order', () => {
  assert.deepEqual([...prefixesToBytes(['ab12', '00ff'])], [0xab, 0x12, 0x00, 0xff]);
});

test('a contact prefix is the leading bytes of the public key', () => {
  const key = new Uint8Array(32);
  key[0] = 0xef;
  key[1] = 0x56;
  assert.equal(prefixHex(key, 2), 'ef56');
});

test('saved route hops use the packed path length, then the contact', () => {
  const key = new Uint8Array(32);
  key[0] = 0xef;
  key[1] = 0x56;
  const outPath = new Uint8Array(64);
  outPath.set([0xab, 0x12, 0xcd, 0x34]);
  const encoded = (1 << 6) | 2;
  assert.deepEqual(hopsFromSavedRoute(outPath, encoded, key, 2).hops, ['ab12', 'cd34', 'ef56']);
});

test('a direct contact is just its own prefix', () => {
  const key = Uint8Array.from([0xaa, 0xbb]);
  assert.deepEqual(hopsFromSavedRoute(new Uint8Array(64), 0, key, 2).hops, ['aabb']);
  assert.deepEqual(hopsFromSavedRoute(new Uint8Array(64), -1, key, 2).hops, ['aabb']);
});

test('a 3-byte saved route is refused', () => {
  const key = Uint8Array.from([1, 2, 3, 4]);
  const encoded = (2 << 6) | 1;
  const asInt8 = encoded > 127 ? encoded - 256 : encoded;
  const result = hopsFromSavedRoute(new Uint8Array(64), asInt8, key, 2);
  assert.match(result.error, /3-byte/);
  assert.deepEqual(result.hops, []);
});
