import WebBleConnection from '@liamcottle/meshcore.js/src/connection/web_ble_connection.js';
import { prefixHex } from './path.js';
import { installTraceParser } from './trace.js';

export function bluetoothAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export async function connectCompanion() {
  if (!bluetoothAvailable()) {
    throw new Error('Web Bluetooth is not available. Use Chrome or Edge.');
  }
  const conn = await WebBleConnection.open();
  if (!conn) throw new Error('No companion selected.');
  installTraceParser(conn);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Companion did not finish connecting.')), 20000);
    conn.on('connected', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return conn;
}

export async function loadIdentity(conn) {
  let self = null;
  try {
    self = await conn.getSelfInfo(8000);
  } catch {
    self = null;
  }
  const contacts = await conn.getContacts();
  return {
    selfName: (self?.name || '').trim() || 'me',
    deviceName: conn.bleDevice?.name || '',
    contacts: (contacts || []).map((contact) => ({
      name: (contact.advName || '').trim() || 'unnamed',
      publicKey: Array.from(contact.publicKey || []),
      outPath: Array.from(contact.outPath || []),
      outPathLen: contact.outPathLen,
      lastAdvert: Number(contact.lastAdvert) || 0,
    })),
  };
}

export function contactPrefix(contact, hashBytes) {
  return prefixHex(contact.publicKey, hashBytes);
}

// lastAdvert is the unix time of the last advert this companion heard. Zero means it has none.
export function byLastSeen(a, b) {
  const delta = (Number(b.lastAdvert) || 0) - (Number(a.lastAdvert) || 0);
  if (delta !== 0) return delta;
  return String(a.name || '').localeCompare(String(b.name || ''));
}
