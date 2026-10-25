import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const provinces = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Free State',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
] as const;
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');
const text = (min: number, max: number) => z.string().trim().min(min).max(max).transform(tidy);
const optionalText = (max: number) => z.string().trim().max(max).transform(tidy).default('');
export const profileUpdateSchema = z
  .object({
    name: text(2, 80).optional(),
    phone: z
      .union([
        z.literal(''),
        z
          .string()
          .trim()
          .regex(/^\+?[0-9][0-9\s()-]{6,19}$/)
          .max(24),
      ])
      .optional(),
    about: optionalText(250).optional(),
    preferredLanguage: z
      .enum([
        'English',
        'isiZulu',
        'isiXhosa',
        'Sesotho',
        'Setswana',
        'Afrikaans',
        'Sepedi',
        'Other',
      ])
      .optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'No profile changes provided' });

export const addressInputSchema = z
  .object({
    label: z.enum(['Home', 'Work', 'Other']),
    nickname: optionalText(32),
    recipientName: text(2, 80),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s()-]{6,19}$/)
      .max(24),
    street: text(5, 150),
    unit: optionalText(80),
    suburb: optionalText(100),
    city: text(2, 100),
    province: z.enum(provinces),
    postalCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 -]{3,10}$/),
    deliveryNotes: optionalText(180),
    isDefault: z.boolean().default(false),
  })
  .strict();
export type AddressInput = z.infer<typeof addressInputSchema>;
export type Province = (typeof provinces)[number];
/** A stored address. Province is '' only for legacy records saved before it was validated. */
export type SavedAddress = Omit<AddressInput, 'province'> & { id: string; province: Province | '' };
const addressLabels = ['Home', 'Work', 'Other'] as const;
export type ProfileData = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'customer';
  phone: string;
  about: string;
  preferredLanguage: string;
  marketingOptIn: boolean;
  memberSince: string | null;
  avatarUpdatedAt: string | null;
  addresses: SavedAddress[];
};
/** What formatProfile reads: a stored user document, or a demo user merged with its profile. */
export type ProfileSource = {
  _id?: unknown;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  phone?: string | null;
  about?: string | null;
  preferredLanguage?: string | null;
  marketingOptIn?: boolean | null;
  memberSince?: string | null;
  createdAt?: Date | string | null;
  avatarUpdatedAt?: Date | string | null;
  addresses?: ReadonlyArray<{ [K in keyof SavedAddress]?: unknown }> | null;
};
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const oneOf = <T extends string>(allowed: readonly T[], value: unknown): T | undefined =>
  allowed.find((option) => option === value);
const isoDate = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;
/**
 * The profile the API returns, with every field present and well-typed even when the stored
 * record is incomplete: missing text becomes '', an unknown role is a customer, an unknown
 * address label is 'Other', an unknown province is '' (kept so the shopper can fix it), and an
 * address without an id, which could never be edited or removed, is left out.
 */
export function formatProfile(u: ProfileSource, id?: string): ProfileData {
  return {
    id: id || String(u._id),
    name: str(u.name),
    email: str(u.email),
    role: u.role === 'admin' ? 'admin' : 'customer',
    phone: str(u.phone),
    about: str(u.about),
    preferredLanguage: str(u.preferredLanguage) || 'English',
    marketingOptIn: Boolean(u.marketingOptIn),
    memberSince: u.memberSince || isoDate(u.createdAt),
    avatarUpdatedAt: isoDate(u.avatarUpdatedAt),
    addresses: normalizeAddressDefaults(
      (u.addresses || [])
        .filter((a) => typeof a.id === 'string' && a.id)
        .map((a) => ({
          id: str(a.id),
          label: oneOf(addressLabels, a.label) ?? 'Other',
          nickname: str(a.nickname),
          recipientName: str(a.recipientName),
          phone: str(a.phone),
          street: str(a.street),
          unit: str(a.unit),
          suburb: str(a.suburb),
          city: str(a.city),
          province: oneOf(provinces, a.province) ?? '',
          postalCode: str(a.postalCode),
          deliveryNotes: str(a.deliveryNotes),
          isDefault: Boolean(a.isDefault),
        })),
    ),
  };
}

/** Exactly one default whenever the user has at least one address. */
export function normalizeAddressDefaults(
  addresses: SavedAddress[],
  preferredId?: string,
): SavedAddress[] {
  if (!addresses.length) return [];
  const selected =
    addresses.find((a) => a.id === preferredId) ||
    addresses.find((a) => a.isDefault) ||
    addresses[0];
  return addresses.map((a) => ({ ...a, isDefault: a.id === selected.id }));
}
export function appendAddress(
  addresses: SavedAddress[],
  input: AddressInput,
  max = 10,
): SavedAddress[] {
  if (addresses.length >= max) throw Error('Maximum of ' + max + ' saved addresses reached');
  const next = { ...input, id: randomUUID(), isDefault: input.isDefault || addresses.length === 0 };
  return normalizeAddressDefaults([...addresses, next], next.isDefault ? next.id : undefined);
}
export function editAddress(
  addresses: SavedAddress[],
  id: string,
  input: AddressInput,
): SavedAddress[] | null {
  if (!addresses.some((a) => a.id === id)) return null;
  const next = addresses.map((a) =>
    a.id === id ? { ...input, id, isDefault: input.isDefault || a.isDefault } : a,
  );
  return normalizeAddressDefaults(next, input.isDefault ? id : undefined);
}
export function removeAddress(addresses: SavedAddress[], id: string): SavedAddress[] | null {
  if (!addresses.some((a) => a.id === id)) return null;
  return normalizeAddressDefaults(addresses.filter((a) => a.id !== id));
}
export function setDefaultAddress(addresses: SavedAddress[], id: string): SavedAddress[] | null {
  if (!addresses.some((a) => a.id === id)) return null;
  return normalizeAddressDefaults(addresses, id);
}

export const maxAvatarBytes = 512 * 1024;
/** Reject SVGs and arbitrary files; browser uploads are reduced to JPEG/PNG/WebP. */
export function detectAvatarMime(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (buf.length >= 4 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
}
