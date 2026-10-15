import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';

export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
}

export function unauthenticated() {
  return new GraphQLError('A valid authentication token is required.', { extensions: { code: 'UNAUTHENTICATED' } });
}

export function authenticate(authorization?: unknown): AuthUser | null {
  const demo = process.env.AUTH_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
  if (authorization == null || authorization === '') {
    return demo ? { id: 'demo-admin', email: 'admin@example.com', role: 'ADMIN' } : null;
  }
  if (typeof authorization !== 'string') throw unauthenticated();
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (demo && token === 'demo-admin') return { id: 'demo-admin', email: 'admin@example.com', role: 'ADMIN' };
  const secret = process.env.JWT_SECRET;
  if (!secret) throw unauthenticated();
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string') throw unauthenticated();
    const id = payload.sub ?? payload.id;
    if (typeof id !== 'string' || !id.trim() || typeof payload.email !== 'string' ||
        !payload.email.trim() || (payload.role !== 'ADMIN' && payload.role !== 'EMPLOYEE')) throw unauthenticated();
    return { id, email: payload.email, role: payload.role };
  } catch { throw unauthenticated(); }
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
