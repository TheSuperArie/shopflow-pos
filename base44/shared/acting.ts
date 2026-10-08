/**
 * "Authorized network manager" (מנהל רשת מורשה): an account that manages someone else's network
 * with no POS of its own. Recorded only by the developer, in AdminSecret (service-role only):
 * a row { owner_email: <manager>, delegate_of: <network owner email> }.
 *
 * Functions that authorize by the caller's email call actingUser() right after auth.me(): for a
 * manager it returns the caller with email = the network owner's, so every existing check
 * ("is this my network / my branch") treats him exactly like the owner. The real address stays in
 * delegate_email (for logs). Everyone else is returned unchanged.
 */
const lc = (s) => String(s || '').trim().toLowerCase();

export async function delegateOwnerOf(base44, email) {
  const me = lc(email);
  if (!me) return null;
  const rows = await base44.asServiceRole.entities.AdminSecret.filter({ owner_email: me }, 'created_date', 5);
  const owner = rows.map(r => lc(r.delegate_of)).find(Boolean);
  return owner && owner !== me ? owner : null;
}

export async function actingUser(base44, user) {
  if (!user?.email) return user;
  const owner = await delegateOwnerOf(base44, user.email);
  if (!owner) return user;
  const [ownerUser] = await base44.asServiceRole.entities.User.filter({ email: owner }, undefined, 1);
  return { ...user, email: owner, id: ownerUser?.id || user.id, delegate_email: lc(user.email), is_delegate: true };
}
