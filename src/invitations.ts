import { randomBytes } from 'node:crypto';
import type { PrismaClient } from './generated/prisma/client.js';
import type { AuthUser } from './auth.js';
import { requireAdmin, requireUser } from './auth.js';
import { invitationHash, normalizedEmail, sessionEvents } from './accounts.js';
import { badInput, notFound } from './errors.js';

export async function createInvitation(db: PrismaClient, identity: AuthUser | null | undefined, inputEmail: string) {
  const actor = requireUser(identity); requireAdmin(actor);
  const email = normalizedEmail(inputEmail);
  const token = randomBytes(32).toString('base64url');
  const invitation = await db.$transaction(async tx => {
    await tx.registrationLock.upsert({ where: { id: 1 }, create: { id: 1 }, update: { version: { increment: 1 } } });
    if (await tx.user.findUnique({ where: { email } })) throw badInput('An account with this email already exists.');
    if (await tx.invitation.findFirst({ where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })) throw badInput('An active invitation already exists for this email. Revoke it before creating another.');
    return tx.invitation.create({ data: { email, tokenHash: invitationHash(token), createdById: actor.id, expiresAt: new Date(Date.now() + 7 * 86400000) } });
  });
  return { token, invitation };
}

export async function setAccountActive(db: PrismaClient, identity: AuthUser | null | undefined, userId: string, active: boolean) {
  const actor = requireUser(identity); requireAdmin(actor);
  if (actor.id === userId && !active) throw badInput('You cannot deactivate your own account.');
  const result = await db.$transaction(async tx => {
    await tx.registrationLock.upsert({ where: { id: 1 }, create: { id: 1 }, update: { version: { increment: 1 } } });
    const account = await tx.user.findUnique({ where: { id: userId } });
    if (!account) throw notFound('Account', userId);
    if (!active && account.active && account.role === 'ADMIN' && await tx.user.count({ where: { active: true, role: 'ADMIN' } }) <= 1) throw badInput('The last active administrator cannot be deactivated.');
    const updated = await tx.user.update({ where: { id: userId }, data: { active } });
    const sessions = active ? [] : await tx.session.findMany({ where: { userId } });
    if (!active) await tx.session.deleteMany({ where: { userId } });
    return { updated, sessions };
  });
  sessionEvents.emit('revoked', result.sessions.map(session => session.id));
  return result.updated;
}
