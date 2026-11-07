const WIDTHS = new Set([1, 2, 4]);

export function bytesToHex(bytes) {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function prefixHex(publicKey, hashBytes) {
  const bytes = publicKey instanceof Uint8Array ? publicKey : Uint8Array.from(publicKey);
  return bytesToHex(bytes.subarray(0, hashBytes));
}

export function flagsForHashBytes(hashBytes) {
  if (hashBytes === 1) return 0;
  if (hashBytes === 2) return 1;
  if (hashBytes === 4) return 2;
  throw new Error(`Trace hash width must be 1, 2, or 4 bytes (got ${hashBytes}).`);
}

function prefixError(token, hex) {
  const width = hex.length / 2;
  if (width === 3) {
    return `"${token}" is 3 bytes. Trace hashes are 1, 2, or 4 bytes because the firmware encodes the width as a power of two. Use 2 or 4 bytes of the same key.`;
  }
  if (!WIDTHS.has(width)) {
    return `"${token}" is ${width} bytes. Trace hashes must be 1, 2, or 4 bytes.`;
  }
  return null;
}

export function parsePrefixList(text, hashBytes) {
  if (!WIDTHS.has(hashBytes)) {
    throw new Error(`Trace hash width must be 1, 2, or 4 bytes (got ${hashBytes}).`);
  }
  const tokens = String(text).split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
  const hops = [];
  for (const token of tokens) {
    const hex = token.toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]+$/.test(hex)) {
      throw new Error(`"${token}" is not hex.`);
    }
    if (hex.length % 2 !== 0) {
      throw new Error(`"${token}" needs an even number of hex digits.`);
    }
    const widthError = prefixError(token, hex);
    if (widthError) throw new Error(widthError);
    if (hex.length / 2 !== hashBytes) {
      throw new Error(`"${token}" is ${hex.length / 2} bytes, but the trace width is ${hashBytes}.`);
    }
    hops.push(hex);
  }
  return hops;
}

// A trailing comma or space finishes every token. Anything after the last delimiter is still being typed.
export function draftParts(text) {
  const value = String(text ?? '');
  const ended = /[\s,]$/.test(value);
  const tokens = value.split(/[\s,]+/).filter(Boolean);
  if (ended || tokens.length === 0) return { ready: tokens, pending: '' };
  return { ready: tokens.slice(0, -1), pending: tokens[tokens.length - 1] };
}

// Turn finished prefixes into hops. A bad token stays in the field, with whatever was typed after it.
export function takeReadyPrefixes(text, hashBytes) {
  const { ready, pending } = draftParts(text);
  const hops = [];
  for (let index = 0; index < ready.length; index++) {
    try {
      hops.push(...parsePrefixList(ready[index], hashBytes));
    } catch (err) {
      const rest = ready.slice(index);
      const leftover = pending ? [...rest, pending] : rest;
      return { hops, pending: leftover.join(', '), error: err.message };
    }
  }
  return { hops, pending, error: null };
}

export function prefixesToBytes(hops) {
  const bytes = [];
  for (const hex of hops) {
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
  }
  return new Uint8Array(bytes);
}

// Keep hops until a node shows up again. The rest is a return someone pasted, or a second visit.
export function appendHops(existing, incoming) {
  const hops = existing.slice();
  const seen = new Set(hops);
  let cutAt = null;
  for (const hop of incoming) {
    if (seen.has(hop)) {
      cutAt = hop;
      break;
    }
    seen.add(hop);
    hops.push(hop);
  }
  return { hops, cutAt };
}

// A one-hop trace already comes back: the target retransmits and this radio hears it.
// Longer paths are walked back, without repeating the far node. A repeated node ends the outbound list first.
export function expandRoundTrip(hops) {
  const outbound = appendHops([], hops).hops;
  if (outbound.length < 2) return outbound;
  return outbound.concat(outbound.slice(0, -1).reverse());
}

function pathLenByte(outPathLen) {
  if (outPathLen == null) return 0xff;
  const asInt = Number(outPathLen);
  if (!Number.isInteger(asInt)) return 0xff;
  return asInt < 0 ? (asInt + 256) & 0xff : asInt & 0xff;
}

export function hopsFromSavedRoute(outPath, outPathLen, publicKey, hashBytes) {
  const contact = prefixHex(publicKey, hashBytes);
  const encoded = pathLenByte(outPathLen);
  if (encoded === 0xff) return { hops: [contact] };

  const size = (encoded >> 6) + 1;
  const count = encoded & 63;
  if (count === 0) return { hops: [contact] };
  if (size === 3) {
    return {
      error: 'Saved route uses 3-byte hashes. Trace width is a power of two (1, 2, or 4), so those prefixes cannot be traced.',
      hops: [],
    };
  }
  if (!WIDTHS.has(size) || size !== hashBytes) {
    return {
      error: `Saved route uses ${size}-byte hashes, but the trace width is ${hashBytes}.`,
      hops: [],
    };
  }

  const bytes = outPath instanceof Uint8Array ? outPath : Uint8Array.from(outPath || []);
  const hops = [];
  for (let i = 0; i < count; i++) {
    const start = i * size;
    hops.push(bytesToHex(bytes.subarray(start, start + size)));
  }
  hops.push(contact);
  return { hops };
}
