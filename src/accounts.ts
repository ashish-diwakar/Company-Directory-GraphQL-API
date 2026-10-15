import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';
import type { PrismaClient, User, Prisma } from './generated/prisma/client.js';
import { badInput } from './errors.js';
import { requireUser, unauthenticated } from './auth.js';
import type { AuthUser } from './auth.js';

export const sessionEvents = new EventEmitter();
const SESSION_MS = 8 * 60 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();
export function throttleAuthentication(address = 'internal') {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
  const current = attempts.get(address) ?? { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (current.count >= 30 || (!attempts.has(address) && attempts.size >= 10000)) {
    throw new GraphQLError('Too many sign-in or registration attempts. Try again in 15 minutes.', { extensions: { code: 'TOO_MANY_REQUESTS' } });
  }
  current.count++; attempts.set(address, current);
}
function secret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured for account authentication.');
  return process.env.JWT_SECRET;
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, hash) => error ? reject(error) : resolve(hash)));
}
function validatePassword(password: string) {
  if (password.length < 12 || password.length > 128) throw badInput('Use a password between 12 and 128 characters.');
}
export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, key] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !key || password.length > 128) return false;
  const hash = await derive(password, salt);
  const expected = Buffer.from(key, 'hex');
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}
function normalizedEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw badInput('A valid email address is required.');
  return normalized;
}
export function validateName(name: string) {
  const normalized = name.trim();
  if (!normalized || normalized.length > 100) throw badInput('Name must contain between 1 and 100 characters.');
  return normalized;
}
async function issueSession(tx: Prisma.TransactionClient, user: User) {
  const expiresAt = new Date(Date.now() + SESSION_MS);
  const session = await tx.session.create({ data: { userId: user.id, expiresAt } });
  const token = jwt.sign({ email: user.email, role: user.role }, secret(), {
    subject: user.id, jwtid: session.id, expiresIn: '8h', algorithm: 'HS256',
  });
  return { token, user, expiresAt: expiresAt.toISOString() };
}
export async function register(db: PrismaClient, input: { name: string; email: string; password: string }) {
  secret();
  const name = validateName(input.name);
  const email = normalizedEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async tx => {
      // First write obtains SQLite's writer lock BEFORE the first-user decision.
      await tx.registrationLock.upsert({ where: { id: 1 }, create: { id: 1 }, update: { version: { increment: 1 } } });
      const first = await tx.user.count() === 0;
      const user = await tx.user.create({ data: { name, email, passwordHash, role: first ? 'ADMIN' : 'EMPLOYEE' } });
      return issueSession(tx, user);
    }, { timeout: 10000 });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw badInput('An account with this email already exists.');
    throw error;
  }
}
// Missing users still incur scrypt work, and failures share one error message.
const dummyHash = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
export async function signIn(db: PrismaClient, email: string, password: string) {
  secret();
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);
  if (!user || !valid) throw new GraphQLError('Email or password is incorrect.', { extensions: { code: 'UNAUTHENTICATED' } });
  return db.$transaction(async tx => {
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current || current.passwordHash !== user.passwordHash) throw unauthenticated();
    return issueSession(tx, current);
  });
}
export async function sessionUser(db: PrismaClient, identity: AuthUser | null | undefined) {
  const user = requireUser(identity);
  if (!user.sessionId) throw unauthenticated();
  const session = await db.session.findUnique({ where: { id: user.sessionId }, include: { user: true } });
  if (!session || session.userId !== user.id || session.expiresAt.getTime() <= Date.now()) throw unauthenticated();
  return session.user;
}
export async function signOut(db: PrismaClient, identity: AuthUser | null | undefined) {
  const user = requireUser(identity);
  if (user.sessionId) {
    await db.session.deleteMany({ where: { id: user.sessionId, userId: user.id } });
    sessionEvents.emit('revoked', [user.sessionId]);
  }
  return true;
}
export async function changePassword(db: PrismaClient, identity: AuthUser | null | undefined, current: string, next: string) {
  const user = await sessionUser(db, identity);
  if (!await verifyPassword(current, user.passwordHash)) throw badInput('Current password is incorrect.');
  const passwordHash = await hashPassword(next);
  const revoked = await db.$transaction(async tx => {
    // Compare the old hash so concurrent password changes cannot overwrite each other.
    const updated = await tx.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { passwordHash } });
    if (!updated.count) throw badInput('Password has changed. Sign in again.');
    const sessions = await tx.session.findMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    return sessions;
  });
  sessionEvents.emit('revoked', revoked.map(session => session.id));
  return true;
}
