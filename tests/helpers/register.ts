import { register } from '../../src/accounts.js';
import { createInvitation } from '../../src/invitations.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

// Fixtures use the same invitation flow as the application, never an auth bypass.
export async function registerTestUser(db: PrismaClient, input: { name: string; email: string; password: string }) {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN', active: true } });
  const invitation = admin ? await createInvitation(db, { id: admin.id, email: admin.email, role: admin.role }, input.email) : null;
  return register(db, { ...input, ...(invitation ? { invitationToken: invitation.token } : {}) });
}
