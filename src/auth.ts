export type Role = 'admin' | 'customer';
export type Identity = { sub: string; email: string; name: string; role: Role };
export type StoredUser = { id: string; email: string; name: string; role: Role };
/**
 * Turn verified token claims into the user's *current* identity. Only the token's subject is trusted:
 * name and role come from the stored account, so demotions and deletions apply on the next request.
 */
export async function currentIdentity(
  claims: unknown,
  loadUser: (id: string) => Promise<StoredUser | undefined>,
): Promise<Identity | null> {
  const sub = claims && typeof claims === 'object' ? (claims as { sub?: unknown }).sub : undefined;
  if (typeof sub !== 'string' || !sub) return null;
  const user = await loadUser(sub);
  return user ? { sub: user.id, email: user.email, name: user.name, role: user.role } : null;
}
