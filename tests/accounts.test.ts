import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { createDatabase } from '../src/db.js';
import { createApplication } from '../src/app.js';
import { verifyPassword, throttleAuthentication } from '../src/accounts.js';
import { WebSocket } from 'ws';
import { once } from 'node:events';

describe('Account registration and revocable sessions', () => {
  let directory: string;
  let db: ReturnType<typeof createDatabase>;
  let application: Awaited<ReturnType<typeof createApplication>>;
  let adminToken: string;
  let employeeToken: string;
  const savedSecret = process.env.JWT_SECRET;
  const savedDemo = process.env.AUTH_DEMO_MODE;
  const password = 'a strong test password 123';
  const registration = 'mutation($input: RegisterInput!) { register(input:$input) { token user { id name email role } } }';
  const login = 'mutation($email:String!,$password:String!) { signIn(email:$email,password:$password) { token user { id name email role } } }';
  async function post(query: string, variables = {}, token?: string) {
    const operation = request(application.app).post('/graphql').send({ query, variables });
    return token ? operation.set('Authorization', `Bearer ${token}`) : operation;
  }
  beforeAll(async () => {
    process.env.JWT_SECRET = 'account-tests-secret'; process.env.AUTH_DEMO_MODE = 'false';
    directory = await mkdtemp(join(tmpdir(), 'directory-accounts-'));
    db = createDatabase('file:' + join(directory, 'test.db').replaceAll('\\', '/'));
    for (const migration of (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort()) {
      const sql = await readFile(join('prisma/migrations', migration, 'migration.sql'), 'utf8');
      for (const statement of sql.split(';').filter(part => part.trim())) await db.$executeRawUnsafe(statement);
    }
    application = await createApplication(db);
  });
  afterAll(async () => {
    try { await application?.server.stop(); } finally {
      await db?.$disconnect();
      if (directory) await rm(directory, { recursive: true, force: true });
      if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
      if (savedDemo === undefined) delete process.env.AUTH_DEMO_MODE; else process.env.AUTH_DEMO_MODE = savedDemo;
    }
  });

  it('rejects weak registration without consuming the first administrator', async () => {
    const response = await post(registration, { input: { name: 'First', email: 'first@example.com', password: 'short' } });
    expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(await db.user.count()).toBe(0);
  });
  it('creates exactly one admin under simultaneous registrations and stores only password hashes', async () => {
    const results = await Promise.all(['first', 'second'].map(name => post(registration, { input: { name, email: `${name}@example.com`, password } })));
    const success = results.filter(response => !response.body.errors);
    expect(success).toHaveLength(1);
    expect(results.filter(response => response.body.errors)).toHaveLength(1);
    adminToken = success[0]!.body.data.register.token;
    const missingEmail = results[0]!.body.errors ? 'first@example.com' : 'second@example.com';
    const invite = await post('mutation($email:String!) { createInvitation(email:$email) { token } }', { email: missingEmail }, adminToken);
    expect(invite.body.errors).toBeUndefined();
    const joined = await post(registration, { input: { name: 'Invited Employee', email: missingEmail, password, invitationToken: invite.body.data.createInvitation.token } });
    expect(joined.body.errors).toBeUndefined();
    employeeToken = joined.body.data.register.token;
    const accounts = await db.user.findMany();
    expect(accounts.filter(user => user.role === 'ADMIN')).toHaveLength(1);
    expect(accounts.filter(user => user.role === 'EMPLOYEE')).toHaveLength(1);
    for (const account of accounts) {
      expect(account.passwordHash).not.toContain(password);
      expect(await verifyPassword(password, account.passwordHash)).toBe(true);
    }
  });
  it('normalizes email, rejects duplicate registrations, and does not accept a client role', async () => {
    const response = await post(registration, { input: { name: 'Duplicate', email: ' FIRST@EXAMPLE.COM ', password } });
    expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const escalation = await post(registration, { input: { name: 'Escalation', email: 'third@example.com', password, role: 'ADMIN' } });
    expect(escalation.body.errors).toBeDefined();
    expect(await db.user.count({ where: { role: 'ADMIN' } })).toBe(1);
  });
  it('signs in with normalized email and returns one generic error for unknown/wrong credentials', async () => {
    const valid = await post(login, { email: ' FIRST@EXAMPLE.COM ', password });
    expect(valid.body.errors).toBeUndefined();
    expect(valid.body.data.signIn.token).toBeTruthy();
    const wrong = await post(login, { email: 'first@example.com', password: 'incorrect-password' });
    const missing = await post(login, { email: 'unknown@example.com', password });
    expect(wrong.body.errors[0].message).toBe(missing.body.errors[0].message);
    expect(wrong.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });
  it('protects the directory and admin account list, and ignores forged role claims', async () => {
    expect((await post('{ employees { id } }')).body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect((await post('{ users { id } }', {}, employeeToken)).body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect((await post('{ users { id } }', {}, adminToken)).body.data.users).toHaveLength(2);
    const claims = jwt.decode(employeeToken) as jwt.JwtPayload;
    const forged = jwt.sign({ ...claims, role: 'ADMIN' }, process.env.JWT_SECRET!);
    expect((await post('{ users { id } }', {}, forged)).body.errors[0].extensions.code).toBe('FORBIDDEN');
  });
  it('updates profile without changing email or role', async () => {
    const response = await post('mutation { updateProfile(name:" New Name ") { name role } }', {}, employeeToken);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.updateProfile).toEqual({ name: 'New Name', role: 'EMPLOYEE' });
  });
  it('revokes a signed-out token and closes its active WebSocket', async () => {
    await new Promise<void>(resolve => application.httpServer.listen(0, '127.0.0.1', resolve));
    const address = application.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('No listener');
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/graphql`, 'graphql-transport-ws');
    try {
      await once(socket, 'open');
      const acknowledged = once(socket, 'message');
      socket.send(JSON.stringify({ type: 'connection_init', payload: { authToken: employeeToken } }));
      expect(JSON.parse(String((await acknowledged)[0])).type).toBe('connection_ack');
      const closed = once(socket, 'close');
      expect((await post('mutation { signOut }', {}, employeeToken)).body.data.signOut).toBe(true);
      expect((await closed)[0]).toBe(4401);
      expect((await post('{ me { id } }', {}, employeeToken)).status).toBe(401);
    } finally { socket.terminate(); }
  });
  it('changes password, revokes all sessions, and requires the new password', async () => {
    const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    const second = await post(login, { email: admin.email, password });
    const otherToken = second.body.data.signIn.token;
    const query = 'mutation($current:String!,$next:String!) { changePassword(currentPassword:$current,newPassword:$next) }';
    expect((await post(query, { current: 'wrong', next: 'a new secure password 123' }, adminToken)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await post(query, { current: password, next: 'a new secure password 123' }, adminToken)).body.data.changePassword).toBe(true);
    for (const token of [adminToken, otherToken]) expect((await post('{ me { id } }', {}, token)).status).toBe(401);
    expect((await post(login, { email: admin.email, password })).body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect((await post(login, { email: admin.email, password: 'a new secure password 123' })).body.errors).toBeUndefined();
  });
  it('limits repeated authentication attempts', () => {
    for (let attempt = 0; attempt < 30; attempt++) throttleAuthentication('isolated-rate-limit-test');
    expect(() => throttleAuthentication('isolated-rate-limit-test')).toThrow('Too many sign-in or registration attempts.');
  });
});
