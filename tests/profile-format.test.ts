import assert from 'node:assert/strict';
import test from 'node:test';
import { formatProfile } from '../src/profile-rules.js';
import { UserModel } from '../src/models.js';

const home = {
  id: 'addr-1',
  label: 'Home',
  nickname: 'Gogo',
  recipientName: 'Thandi Mokoena',
  phone: '0821234567',
  street: '12 Vilakazi Street',
  unit: 'Flat 3',
  suburb: 'Orlando West',
  city: 'Soweto',
  province: 'Gauteng',
  postalCode: '1804',
  deliveryNotes: 'Ring twice',
  isDefault: true,
} as const;

test('a complete stored user is returned unchanged', () => {
  const user = new UserModel({
    name: 'Thandi Mokoena',
    email: 'thandi@example.com',
    role: 'admin',
    phone: '0821234567',
    about: 'Loves rooibos',
    preferredLanguage: 'isiZulu',
    marketingOptIn: true,
    addresses: [home],
  });
  user.set('createdAt', new Date('2026-01-02T03:04:05.000Z'));
  assert.deepEqual(formatProfile(user), {
    id: String(user._id),
    name: 'Thandi Mokoena',
    email: 'thandi@example.com',
    role: 'admin',
    phone: '0821234567',
    about: 'Loves rooibos',
    preferredLanguage: 'isiZulu',
    marketingOptIn: true,
    memberSince: '2026-01-02T03:04:05.000Z',
    avatarUpdatedAt: null,
    addresses: [home],
  });
});

test('missing fields get defaults instead of being left out', () => {
  assert.deepEqual(formatProfile({ _id: 'u-1' }), {
    id: 'u-1',
    name: '',
    email: '',
    role: 'customer',
    phone: '',
    about: '',
    preferredLanguage: 'English',
    marketingOptIn: false,
    memberSince: null,
    avatarUpdatedAt: null,
    addresses: [],
  });
});

test('an unknown role is treated as a customer, never an admin', () => {
  assert.equal(formatProfile({ _id: 'u-1', role: 'superuser' }).role, 'customer');
  assert.equal(formatProfile({ _id: 'u-1', role: null }).role, 'customer');
});

test('incomplete stored addresses are repaired, and ones without an id are left out', () => {
  const { addresses } = formatProfile({
    _id: 'u-1',
    addresses: [
      { id: 'addr-legacy', label: 'Holiday', province: 'Transvaal', street: '1 Old Road' },
      { label: 'Home', street: 'No id, cannot be edited' },
    ],
  });
  assert.deepEqual(addresses, [
    {
      id: 'addr-legacy',
      label: 'Other',
      nickname: '',
      recipientName: '',
      phone: '',
      street: '1 Old Road',
      unit: '',
      suburb: '',
      city: '',
      province: '',
      postalCode: '',
      deliveryNotes: '',
      // The only address becomes the default, as before.
      isDefault: true,
    },
  ]);
});

test('demo profiles use the given id and their own memberSince', () => {
  const profile = formatProfile(
    {
      name: 'Demo Shopper',
      email: 'shopper@kasidrop.test',
      role: 'customer',
      memberSince: '2026-10-25T00:00:00.000Z',
    },
    'customer-demo',
  );
  assert.equal(profile.id, 'customer-demo');
  assert.equal(profile.memberSince, '2026-10-25T00:00:00.000Z');
});
