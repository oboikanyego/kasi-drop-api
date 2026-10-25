import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addressInputSchema,
  appendAddress,
  editAddress,
  removeAddress,
  setDefaultAddress,
  profileUpdateSchema,
  detectAvatarMime,
  maxAvatarBytes,
} from '../src/profile-rules.js';

const home = {
  label: 'Home',
  nickname: '',
  recipientName: 'Nomsa Test',
  phone: '+27821234567',
  street: '123 Example Street',
  unit: '',
  suburb: 'Parkside',
  city: 'Johannesburg',
  province: 'Gauteng',
  postalCode: '2001',
  deliveryNotes: '',
  isDefault: false,
};
test('profile fields are validated and sensitive fields are rejected', () => {
  assert.equal(
    profileUpdateSchema.parse({ name: '  Nomsa  Test ', preferredLanguage: 'English' }).name,
    'Nomsa Test',
  );
  assert.throws(() => profileUpdateSchema.parse({ role: 'admin' }), /unrecognized_keys/i);
  assert.throws(() => profileUpdateSchema.parse({ name: 'A' }), /too_small/i);
  assert.throws(
    () => profileUpdateSchema.parse({ email: 'evil@example.com' }),
    /unrecognized_keys/i,
  );
});
test('multiple labelled addresses keep exactly one default', () => {
  const a = appendAddress([], addressInputSchema.parse(home));
  assert.equal(a.length, 1);
  assert.equal(a[0].isDefault, true);
  const b = appendAddress(
    a,
    addressInputSchema.parse({ ...home, label: 'Work', street: '45 Office Road', isDefault: true }),
  );
  assert.deepEqual(
    b.map((a) => a.isDefault),
    [false, true],
  );
  const changed = editAddress(
    b,
    b[0].id,
    addressInputSchema.parse({ ...home, nickname: 'My house', isDefault: true }),
  )!;
  assert.deepEqual(
    changed.map((a) => a.isDefault),
    [true, false],
  );
  const preferred = setDefaultAddress(changed, b[1].id)!;
  assert.deepEqual(
    preferred.map((a) => a.isDefault),
    [false, true],
  );
  const reduced = removeAddress(preferred, b[1].id)!;
  assert.equal(reduced.length, 1);
  assert.equal(reduced[0].isDefault, true);
  assert.equal(removeAddress(reduced, 'other'), null);
});
test('address validation enforces South African provinces and limits', () => {
  assert.throws(() => addressInputSchema.parse({ ...home, province: 'Other' }));
  assert.throws(() => addressInputSchema.parse({ ...home, street: 'x' }));
  let addresses = [] as ReturnType<typeof appendAddress>;
  for (let i = 0; i < 10; i++)
    addresses = appendAddress(addresses, addressInputSchema.parse({ ...home }));
  assert.throws(() => appendAddress(addresses, addressInputSchema.parse(home)), /Maximum of 10/);
});
test('photo validation accepts image magic bytes only', () => {
  assert.equal(detectAvatarMime(Buffer.from([255, 216, 255, 224])), 'image/jpeg');
  assert.equal(detectAvatarMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(detectAvatarMime(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(detectAvatarMime(Buffer.from('<svg><script>alert(1)</script></svg>')), null);
  assert.equal(maxAvatarBytes, 524288);
});
