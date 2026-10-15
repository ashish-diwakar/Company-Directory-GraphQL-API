import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { createApplication } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { securityConfiguration } from '../src/browser-security.js';

describe('HttpOnly browser sessions, CSRF, and origin restrictions', () => {
  const trusted = 'http://127.0.0.1:5173';
  const saved = { secret: process.env.JWT_SECRET, origins: process.env.ALLOWED_ORIGINS, env: process.env.NODE_ENV };
  let directory: string;
  let db: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let cookie: string;
  let csrf: string;
  let bearer: string;
  const cookieFrom = (headers: Record<string, unknown>) => {
    const value = headers['set-cookie'];
    if (!Array.isArray(value) || typeof value[0] !== 'string') throw new Error('Missing session cookie');
    return value[0].split(';')[0]!;
  };
  async function post(query: string, withCsrf?: string, origin = trusted) {
    const operation = request(app.app).post('/graphql').set('Origin', origin).set('Cookie', cookie).send({ query });
    return withCsrf ? operation.set('X-CSRF-Token', withCsrf) : operation;
  }
  beforeAll(async () => {
    process.env.JWT_SECRET = 'browser-security-test-secret'; process.env.ALLOWED_ORIGINS = trusted;
    directory = await mkdtemp(join(tmpdir(), 'directory-browser-'));
    db = createDatabase('file:' + join(directory, 'test.db').replaceAll('\\', '/'));
    for (const migration of (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort()) {
      const sql = await readFile(join('prisma/migrations', migration, 'migration.sql'), 'utf8');
      for (const statement of sql.split(';').filter(part => part.trim())) await db.$executeRawUnsafe(statement);
    }
    app = await createApplication(db);
  });
  afterAll(async () => {
    try { await app?.server.stop(); } finally {
      await db?.$disconnect();
      if (directory) await rm(directory, { recursive: true, force: true });
      for (const [key, value] of Object.entries({ JWT_SECRET: saved.secret, ALLOWED_ORIGINS: saved.origins, NODE_ENV: saved.env })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
  it('sets an HttpOnly session on registration without requesting a token in browser data', async () => {
    const response = await request(app.app).post('/graphql').set('Origin', trusted).send({ query: 'mutation { register(input:{name:"Admin",email:"admin@example.com",password:"browser-security-password"}) { user { id role } expiresAt } }' });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.register.token).toBeUndefined();
    cookie = cookieFrom(response.headers);
    const header = String(response.headers['set-cookie']);
    expect(header).toContain('HttpOnly'); expect(header).toContain('SameSite=Lax'); expect(header).toContain('Path=/'); expect(header).not.toContain('Domain=');
    expect(response.headers['access-control-allow-origin']).toBe(trusted);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
  it('initializes session-bound CSRF protection without exposing the session token', async () => {
    const response = await request(app.app).get('/auth/csrf').set('Origin', trusted).set('Cookie', cookie);
    expect(response.status).toBe(200); expect(response.body.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(response.body.token).toBeUndefined(); expect(response.headers['cache-control']).toBe('no-store');
    csrf = response.body.csrfToken;
  });
  it('rejects missing/wrong CSRF even for a valid cookie and permits protected requests', async () => {
    expect((await post('{ me { id } }')).status).toBe(403);
    expect((await post('{ me { id } }', '0'.repeat(64))).status).toBe(403);
    const response = await post('{ me { email role } sessionExpiresAt }', csrf);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.me).toEqual({ email: 'admin@example.com', role: 'ADMIN' });
    expect(response.body.data.sessionExpiresAt).toBeTruthy();
  });
  it('rejects untrusted HTTP/preflight origins and does not reflect wildcard CORS', async () => {
    expect((await post('{ me { id } }', csrf, 'https://attacker.example')).status).toBe(403);
    const preflight = await request(app.app).options('/graphql').set('Origin', 'https://attacker.example').set('Access-Control-Request-Method', 'POST');
    expect(preflight.status).toBe(403); expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    expect((await request(app.app).get('/auth/csrf').set('Origin', 'https://attacker.example').set('Cookie', cookie)).status).toBe(403);
  });
  it('cannot mutate through a GET request, and CSRF values cannot cross sessions', async () => {
    const get = await request(app.app).get('/graphql').query({ query: 'mutation { signOut }' }).set('Cookie', cookie).set('Apollo-Require-Preflight', 'true');
    expect(get.status).toBe(405);
    const login = await request(app.app).post('/graphql').send({ query: 'mutation { signIn(email:"admin@example.com",password:"browser-security-password") { token } }' });
    bearer = login.body.data.signIn.token;
    const otherCookie = cookieFrom(login.headers);
    const wrongSession = await request(app.app).post('/graphql').set('Cookie', otherCookie).set('X-CSRF-Token', csrf).send({ query: '{ me { id } }' });
    expect(wrongSession.status).toBe(403);
    const cli = await request(app.app).post('/graphql').set('Authorization', `Bearer ${bearer}`).send({ query: '{ me { id } }' });
    expect(cli.body.errors).toBeUndefined();
  });
  it('authenticates cookie WebSockets only with a trusted Origin and matching CSRF', async () => {
    await new Promise<void>(resolve => app.httpServer.listen(0, '127.0.0.1', resolve));
    const address = app.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('No listener');
    const url = `ws://127.0.0.1:${address.port}/graphql`;
    for (const [token, expected] of [[csrf, 'ack'], ['invalid', 'closed']] as const) {
      const socket = new WebSocket(url, 'graphql-transport-ws', { origin: trusted, headers: { Cookie: cookie } });
      try {
        await once(socket, 'open');
        const result = expected === 'ack' ? once(socket, 'message') : once(socket, 'close');
        socket.send(JSON.stringify({ type: 'connection_init', payload: { csrfToken: token } }));
        if (expected === 'ack') expect(JSON.parse(String((await result)[0])).type).toBe('connection_ack');
        else expect((await result)[0]).toBe(4403);
      } finally { socket.terminate(); }
    }
    for (const origin of ['https://attacker.example', undefined]) {
      const socket = new WebSocket(url, 'graphql-transport-ws', { ...(origin ? { origin } : {}), headers: { Cookie: cookie } });
      socket.on('error', () => {});
      const response = await new Promise<number>(resolve => socket.once('unexpected-response', (_, message) => { message.resume(); resolve(message.statusCode ?? 0); }));
      socket.terminate(); expect(response).toBe(401);
    }
  });
  it('clears the cookie on sign-out and rejects replay of the old session', async () => {
    const response = await post('mutation { signOut }', csrf);
    expect(response.body.data.signOut).toBe(true);
    expect(String(response.headers['set-cookie'])).toContain('Expires=Thu, 01 Jan 1970');
    expect((await post('{ me { id } }', csrf)).status).toBe(401);
    const cleared = await request(app.app).get('/auth/csrf').set('Cookie', cookie);
    expect(cleared.body.csrfToken).toBeNull();
  });
  it('requires explicit HTTPS origins and Secure host-only cookies in production', () => {
    const env = process.env.NODE_ENV; const origins = process.env.ALLOWED_ORIGINS;
    try {
      process.env.NODE_ENV = 'production'; delete process.env.ALLOWED_ORIGINS;
      expect(() => securityConfiguration()).toThrow('ALLOWED_ORIGINS');
      process.env.ALLOWED_ORIGINS = 'http://example.com'; expect(() => securityConfiguration()).toThrow();
      process.env.ALLOWED_ORIGINS = 'https://workspace.example.com';
      const security = securityConfiguration();
      expect(security.cookieName).toBe('__Host-directory_session');
      expect(security.cookieOptions).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    } finally {
      if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
      if (origins === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = origins;
    }
  });
});
