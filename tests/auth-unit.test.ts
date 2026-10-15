import assert from 'node:assert/strict';
import { test } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { authenticate, requireAdmin } from '../src/auth.js';

test('JWT validation, RBAC, and explicit development bypass', () => {
  const saved = { secret: process.env.JWT_SECRET, demo: process.env.AUTH_DEMO_MODE, env: process.env.NODE_ENV };
  const secret = 'test-secret-only';
  process.env.JWT_SECRET = secret;
  process.env.AUTH_DEMO_MODE = 'false';
  try {
    const claims = { sub: 'admin-id', email: 'admin@example.com', role: 'ADMIN' };
    const token = jwt.sign(claims, secret, { expiresIn: '1h' });
    assert.equal(authenticate('Bearer ' + token)?.id, 'admin-id');
    assert.equal(authenticate(token)?.role, 'ADMIN');
    assert.equal(authenticate(), null);
    assert.throws(() => requireAdmin(null), { extensions: { code: 'UNAUTHENTICATED' } });
    assert.throws(() => requireAdmin(undefined), { extensions: { code: 'UNAUTHENTICATED' } });
    assert.throws(() => requireAdmin({ id: 'e', email: 'e@example.com', role: 'EMPLOYEE' }), { extensions: { code: 'FORBIDDEN' } });
    for (const invalid of [
      'invalid', 42, 'Bearer ',
      jwt.sign(claims, 'wrong-secret'),
      jwt.sign(claims, secret, { expiresIn: -1 }),
      jwt.sign(claims, secret, { algorithm: 'HS384' }),
      jwt.sign({ ...claims, role: 'SUPERUSER' }, secret),
      jwt.sign({ sub: 'e', role: 'ADMIN' }, secret),
    ]) assert.throws(() => authenticate(invalid), { extensions: { code: 'UNAUTHENTICATED' } });
    process.env.AUTH_DEMO_MODE = 'true';
    process.env.NODE_ENV = 'development';
    assert.equal(authenticate()?.role, 'ADMIN');
    assert.equal(authenticate('demo-admin')?.role, 'ADMIN');
    assert.throws(() => authenticate('bad-token'));
    process.env.NODE_ENV = 'production';
    assert.equal(authenticate(), null);
    assert.throws(() => authenticate('demo-admin'));
  } finally {
    for (const [key, value] of Object.entries({ JWT_SECRET: saved.secret, AUTH_DEMO_MODE: saved.demo, NODE_ENV: saved.env })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
