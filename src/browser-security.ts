import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';

export function securityConfiguration() {
  const production = process.env.NODE_ENV === 'production';
  const configured = process.env.ALLOWED_ORIGINS;
  if (production && !configured) throw new Error('ALLOWED_ORIGINS must be configured in production.');
  const origins = new Set((configured ?? 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4000,http://localhost:4000').split(',').map(value => value.trim()).filter(Boolean));
  if (!origins.size) throw new Error('At least one trusted origin is required.');
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')) throw new Error('ALLOWED_ORIGINS must contain exact origins; production origins must use HTTPS.');
  }
  const cookieName = production ? '__Host-directory_session' : 'directory_session';
  const cookieOptions: CookieOptions = { httpOnly: true, secure: production, sameSite: 'lax', path: '/' };
  return { origins, cookieName, cookieOptions };
}
export function readCookie(header: string | undefined, name: string): string | undefined {
  const values = header?.split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`)) ?? [];
  // Ambiguous cookie identities are never accepted.
  if (values.length !== 1) return undefined;
  try { return decodeURIComponent(values[0]!.slice(name.length + 1)); } catch { return undefined; }
}
export function csrfToken(sessionId: string) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required.');
  return createHmac('sha256', process.env.JWT_SECRET).update(`csrf:${sessionId}`).digest('hex');
}
export function validCsrf(token: unknown, sessionId: string) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(csrfToken(sessionId), 'hex'));
}
