import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTraceCommand, parseTraceBody, TRACE_COMMAND } from '../src/lib/trace.js';

test('trace command carries little-endian tag and the hash-width flags', () => {
  const frame = buildTraceCommand(0x78563412, 0, 1, Uint8Array.from([0x0d, 0x34, 0xab, 0xcd]));
  assert.equal(frame[0], TRACE_COMMAND);
  assert.deepEqual([...frame], [
    0x24,
    0x12, 0x34, 0x56, 0x78,
    0x00, 0x00, 0x00, 0x00,
    0x01,
    0x0d, 0x34, 0xab, 0xcd,
  ]);
});

test('1-byte trace body yields one SNR per hop plus the final SNR', () => {
  const body = Uint8Array.from([
    0x00,
    0x02,
    0x00,
    0x78, 0x56, 0x34, 0x12,
    0x00, 0x00, 0x00, 0x00,
    0xaa, 0xbb,
    0x10,
    0xfc,
    0x08,
  ]);
  const parsed = parseTraceBody(body);
  assert.equal(parsed.tag, 0x12345678);
  assert.equal(parsed.hopCount, 2);
  assert.deepEqual(parsed.snrs, [4, -1]);
  assert.equal(parsed.lastSnr, 2);
  assert.deepEqual([...parsed.pathHashes], [0xaa, 0xbb]);
});

test('2-byte trace body counts hops from the flags, not the hash byte length', () => {
  const body = Uint8Array.from([
    0x00,
    0x04,
    0x01,
    0x11, 0x22, 0x33, 0x44,
    0x00, 0x00, 0x00, 0x00,
    0x0d, 0x34, 0xab, 0xcd,
    0x10,
    0xfc,
    0x08,
  ]);
  const parsed = parseTraceBody(body);
  assert.equal(parsed.flags, 1);
  assert.equal(parsed.hopCount, 2);
  assert.deepEqual(parsed.snrs, [4, -1]);
  assert.equal(parsed.lastSnr, 2);
  assert.equal(parsed.tag, 0x44332211);
});

test('signed SNR uses the full int8 range', () => {
  const body = Uint8Array.from([
    0x00, 0x01, 0x00,
    0x01, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0xaa,
    0x80,
    0x7f,
  ]);
  const parsed = parseTraceBody(body);
  assert.equal(parsed.snrs[0], -32);
  assert.equal(parsed.lastSnr, 31.75);
});

test('a short frame is rejected', () => {
  assert.throws(() => parseTraceBody(Uint8Array.from([0, 1, 0])), /truncated/);
});
