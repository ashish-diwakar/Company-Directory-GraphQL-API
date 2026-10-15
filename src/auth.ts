import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';
import type { PrismaClient } from './generated/prisma/client.js';

export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
  sessionId?: string;
  expiresAt?: number;
  employeeId?: string | null;
}

export function unauthenticated() {
  return new GraphQLError('A valid authentication token is required.', { extensions: { code: 'UNAUTHENTICATED' } });
}

export function authenticate(authorization?: unknown): AuthUser | null {
  if (authorization == null || authorization === '') {
    return null;
  }
  if (typeof authorization !== 'string') throw unauthenticated();
  const token = authorization.replace(/^Bearer\s+/i, '');
  const secret = process.env.JWT_SECRET;
  if (!secret) throw unauthenticated();
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string') throw unauthenticated();
    const id = payload.sub ?? payload.id;
    if (typeof id !== 'string' || !id.trim() || typeof payload.email !== 'string' ||
        !payload.email.trim() || (payload.role !== 'ADMIN' && payload.role !== 'EMPLOYEE')) throw unauthenticated();
    return { id, email: payload.email, role: payload.role, ...(typeof payload.jti === 'string' ? { sessionId: payload.jti } : {}) };
  } catch { throw unauthenticated(); }
}

export async function resolveIdentity(authorization: unknown, db: PrismaClient): Promise<AuthUser | null> {
  const identity = authenticate(authorization);
  if (!identity) return null;
  // All network identities must be backed by a revocable, persisted session.
  if (!identity.sessionId) throw unauthenticated();
  const session = await db.session.findUnique({ where: { id: identity.sessionId }, include: { user: true } });
  if (!session || !session.user.active || session.userId !== identity.id || session.expiresAt.getTime() <= Date.now()) throw unauthenticated();
  return { id: session.user.id, email: session.user.email, role: session.user.role, sessionId: session.id, expiresAt: session.expiresAt.getTime(), employeeId: session.user.employeeId };
}

export function requireUser(user: AuthUser | null | undefined): AuthUser {
  if (!user) throw unauthenticated();
  return user;
}

export function requireAdmin(user: AuthUser | null | undefined) {
  if (requireUser(user).role !== 'ADMIN') {
    throw new GraphQLError('Administrator access is required.', { extensions: { code: 'FORBIDDEN' } });
  }
}
