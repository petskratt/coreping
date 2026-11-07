import Constants from '@liamcottle/meshcore.js/src/constants.js';
import { expandRoundTrip, flagsForHashBytes, parsePrefixList, prefixesToBytes } from './path.js';
import { clipForwardHops, DEFAULT_PATH_STEPS, MAX_CONCURRENT_TRACES } from './store.js';

export const TRACE_COMMAND = 0x24;
export const EXTRA_TIMEOUT_MS = 4000;
const SEND_TIMEOUT_MS = 10000;

function signedByte(byte) {
  return byte & 0x80 ? byte - 256 : byte;
}

export function randomTag() {
  const words = new Uint32Array(1);
  crypto.getRandomValues(words);
  return words[0];
}

export function buildTraceCommand(tag, auth, flags, pathBytes) {
  const frame = new Uint8Array(10 + pathBytes.length);
  const view = new DataView(frame.buffer);
  frame[0] = TRACE_COMMAND;
  view.setUint32(1, tag >>> 0, true);
  view.setUint32(5, auth >>> 0, true);
  frame[9] = flags & 0xff;
  frame.set(pathBytes, 10);
  return frame;
}

// Body is the push after the 0x89 code byte:
// reserved, path_len, flags, tag, auth, hashes, one SNR byte per hop, final SNR.
// Hop count is path_len >> path_sz, not path_len. meshcore.js 1.13 reads path_len
// SNR bytes and always sends flags 0, so 2-byte traces both go out and come back wrong.
export function parseTraceBody(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;
  const need = (count) => {
    if (offset + count > data.length) throw new Error('trace frame truncated');
  };

  need(1);
  const reserved = data[offset++];
  need(1);
  const pathLen = data[offset++];
  need(1);
  const flags = data[offset++];
  need(4);
  const tag = view.getUint32(offset, true);
  offset += 4;
  need(4);
  const authCode = view.getUint32(offset, true);
  offset += 4;

  const width = 1 << (flags & 0x03);
  if (pathLen % width !== 0) {
    throw new Error('trace path length is not a multiple of the hash width');
  }
  need(pathLen);
  const pathHashes = data.slice(offset, offset + pathLen);
  offset += pathLen;

  const hopCount = pathLen >> (flags & 0x03);
  need(hopCount);
  const snrs = [];
  for (let i = 0; i < hopCount; i++) {
    snrs.push(signedByte(data[offset++]) / 4);
  }
  need(1);
  const lastSnr = signedByte(data[offset++]) / 4;

  return { reserved, pathLen, flags, tag, authCode, pathHashes, hopCount, snrs, lastSnr };
}

export function installTraceParser(conn) {
  conn.onTraceDataPush = function onTraceDataPush(bufferReader) {
    try {
      const body = bufferReader.readRemainingBytes();
      this.emit(Constants.PushCodes.TraceData, parseTraceBody(body));
    } catch (err) {
      console.warn('ignored a trace frame that did not parse', err);
    }
  };
}

export function tracePath(conn, pathBytes, hashBytes, extraTimeoutMillis = EXTRA_TIMEOUT_MS) {
  const flags = flagsForHashBytes(hashBytes);
  const tag = randomTag();
  const frame = buildTraceCommand(tag, 0, flags, pathBytes);

  return new Promise((resolve, reject) => {
    let settled = false;
    let waitTimer = null;
    let sendTimer = null;

    const cleanup = () => {
      clearTimeout(waitTimer);
      clearTimeout(sendTimer);
      conn.off(Constants.ResponseCodes.Sent, onSent);
      conn.off(Constants.PushCodes.TraceData, onTrace);
      conn.off(Constants.ResponseCodes.Err, onErr);
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const succeed = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const onSent = (response) => {
      clearTimeout(sendTimer);
      conn.off(Constants.ResponseCodes.Err, onErr);
      const estimate = Number(response?.estTimeout);
      const wait = (Number.isFinite(estimate) ? estimate : 0) + extraTimeoutMillis;
      waitTimer = setTimeout(() => fail(new Error('timeout')), wait);
    };

    const onTrace = (response) => {
      if (response?.tag !== tag) return;
      succeed(response);
    };

    const onErr = (response) => {
      const code = response?.errCode;
      fail(new Error(code == null ? 'trace rejected' : `trace rejected (${code})`));
    };

    conn.on(Constants.ResponseCodes.Sent, onSent);
    conn.on(Constants.PushCodes.TraceData, onTrace);
    conn.on(Constants.ResponseCodes.Err, onErr);
    sendTimer = setTimeout(() => fail(new Error('radio did not accept the trace')), SEND_TIMEOUT_MS);

    conn.sendToRadioFrame(frame).catch(fail);
  });
}

// The first ten enabled paths. Each one is cut to the forward-step setting.
export function activeTraces(targets, pathSteps = DEFAULT_PATH_STEPS) {
  const selected = [];
  let skipped = 0;
  for (const target of targets || []) {
    if (!target?.enabled || !Array.isArray(target.hops) || target.hops.length === 0) continue;
    if (selected.length >= MAX_CONCURRENT_TRACES) {
      skipped += 1;
      continue;
    }
    selected.push({ ...target, hops: clipForwardHops(target.hops, pathSteps) });
  }
  return { targets: selected, skipped };
}

export async function traceRound(conn, targets, hashBytes, shouldStop = () => false, onUpdate = () => {}, pathSteps = DEFAULT_PATH_STEPS) {
  const samples = [];
  for (const target of activeTraces(targets, pathSteps).targets) {
    if (shouldStop()) break;
    const sent = expandRoundTrip(target.hops);
    const base = {
      t: Date.now(),
      targetId: target.id,
      outboundCount: target.hops.length,
      sent,
      snrs: null,
      lastSnr: null,
      error: null,
    };
    onUpdate({ phase: 'running', sent, targetId: target.id });
    let sample;
    try {
      parsePrefixList(target.hops.join(','), hashBytes);
      const result = await tracePath(conn, prefixesToBytes(sent), hashBytes);
      sample = { ...base, t: Date.now(), snrs: result.snrs, lastSnr: result.lastSnr };
    } catch (err) {
      sample = { ...base, t: Date.now(), error: err?.message || String(err) };
    }
    samples.push(sample);
    onUpdate({ phase: 'done', sample });
  }
  return samples;
}
