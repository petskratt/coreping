import assert from 'node:assert/strict';
import test from 'node:test';
import { byLastSeen } from '../src/lib/radio.js';

test('contacts are listed from the most recent advert', () => {
  const contacts = [
    { name: 'Old', lastAdvert: 100 },
    { name: 'Never', lastAdvert: 0 },
    { name: 'Fresh', lastAdvert: 300 },
    { name: 'Also never', lastAdvert: 0 },
    { name: 'Middle', lastAdvert: 200 },
  ];
  const names = contacts.slice().sort(byLastSeen).map((contact) => contact.name);
  assert.deepEqual(names, ['Fresh', 'Middle', 'Old', 'Also never', 'Never']);
});
