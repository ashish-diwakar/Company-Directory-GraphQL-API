import { createTestSchema, applyTestMigrations, dropTestSchema } from './database.js';
import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { createApplication } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { register } from '../src/accounts.js';

describe('Invitation-only access and account deactivation', () => {
  let directory: string;
  let db: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let admin: Awaited<ReturnType<typeof register>>;
  let employeeToken: string;
  let employeeId: string;
  let usedToken: string;
  const savedSecret = process.env.JWT_SECRET;
  const password = 'invitation-test-password';
  const invite = 'mutation($email:String!) { createInvitation(email:$email) { token invitation { id email expiresAt } } }';
  const joinWorkspace = 'mutation($input:RegisterInput!) { register(input:$input) { token user { id role active } } }';
  const status = 'mutation($id:ID!,$active:Boolean!) { setAccountActive(userId:$id,active:$active) { id active } }';
  async function post(query: string, variables = {}, token?: string) {
    const operation = request(app.app).post('/graphql').send({ query, variables });
    return token ? operation.set('Authorization', `Bearer ${token}`) : operation;
  }
  beforeAll(async () => {
    process.env.JWT_SECRET = 'invitations-test-secret';
    directory = await createTestSchema();
    db = createDatabase(directory);
    await applyTestMigrations(db, directory);
    app = await createApplication(db);
  });
  afterAll(async () => {
    try { await app?.server.stop(); } finally {
      await db?.$disconnect();
      if (directory) await dropTestSchema(directory);
      if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
    }
  });
  it('allows bootstrap once, then closes registration even when an invitation is omitted', async () => {
    expect((await post('{ registrationOpen }')).body.data.registrationOpen).toBe(true);
    admin = await register(db, { name: 'Admin', email: 'admin@example.com', password });
    expect((await post('{ registrationOpen }')).body.data.registrationOpen).toBe(false);
    const blocked = await post(joinWorkspace, { input: { name: 'Stranger', email: 'stranger@example.com', password } });
    expect(blocked.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(await db.user.count()).toBe(1);
  });
  it('requires admin access and creates hashed, email-bound invitations', async () => {
    expect((await post(invite, { email: 'employee@example.com' })).body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    const result = await post(invite, { email: ' EMPLOYEE@example.com ' }, admin.token);
    expect(result.body.errors).toBeUndefined();
    const payload = result.body.data.createInvitation;
    usedToken = payload.token;
    const record = await db.invitation.findUniqueOrThrow({ where: { id: payload.invitation.id } });
    expect(record.email).toBe('employee@example.com');
    expect(record.tokenHash).not.toBe(usedToken);
    expect(record.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.expiresAt.getTime() - Date.now()).toBeGreaterThan(6 * 86400000);
    const duplicate = await post(invite, { email: 'employee@example.com' }, admin.token);
    expect(duplicate.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const mismatch = await post(joinWorkspace, { input: { name: 'Wrong', email: 'wrong@example.com', password, invitationToken: usedToken } });
    expect(mismatch.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await db.invitation.findUniqueOrThrow({ where: { id: record.id } })).acceptedAt).toBeNull();
  });
  it('accepts a matching invitation once, and cannot use it for privilege escalation', async () => {
    const input = { name: 'Employee', email: 'employee@example.com', password, invitationToken: usedToken };
    const response = await post(joinWorkspace, { input });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.register.user.role).toBe('EMPLOYEE');
    employeeToken = response.body.data.register.token; employeeId = response.body.data.register.user.id;
    expect((await post(joinWorkspace, { input })).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await post(invite, { email: 'other@example.com' }, employeeToken)).body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect((await post('{ invitations { total } }', {}, employeeToken)).body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect((await post(status, { id: admin.user.id, active: false }, employeeToken)).body.errors[0].extensions.code).toBe('FORBIDDEN');
  });
  it('rejects expired/revoked invitations and permits a replacement after revocation', async () => {
    for (const kind of ['expired', 'revoked']) {
      const email = `${kind}@example.com`;
      const payload = (await post(invite, { email }, admin.token)).body.data.createInvitation;
      if (kind === 'expired') await db.invitation.update({ where: { id: payload.invitation.id }, data: { expiresAt: new Date(0) } });
      else expect((await post('mutation($id:ID!) { revokeInvitation(id:$id) }', { id: payload.invitation.id }, admin.token)).body.data.revokeInvitation).toBe(true);
      expect((await post(joinWorkspace, { input: { name: kind, email, password, invitationToken: payload.token } })).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect((await post(invite, { email }, admin.token)).body.errors).toBeUndefined();
    }
    expect((await post(invite, { email: 'employee@example.com' }, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
  it('consumes a single invitation atomically when acceptance requests race', async () => {
    const email = 'race@example.com';
    const token = (await post(invite, { email }, admin.token)).body.data.createInvitation.token;
    const results = await Promise.all([1, 2].map(() => post(joinWorkspace, { input: { name: 'Race', email, password, invitationToken: token } })));
    expect(results.filter(response => !response.body.errors)).toHaveLength(1);
    expect(await db.user.count({ where: { email } })).toBe(1);
  });
  it('deactivates an account, revokes all sessions, and closes its sockets', async () => {
    await new Promise<void>(resolve => app.httpServer.listen(0, '127.0.0.1', resolve));
    const address = app.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('No listener');
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/graphql`, 'graphql-transport-ws');
    try {
      await once(socket, 'open');
      const ack = once(socket, 'message');
      socket.send(JSON.stringify({ type: 'connection_init', payload: { authToken: employeeToken } }));
      expect(JSON.parse(String((await ack)[0])).type).toBe('connection_ack');
      const closed = once(socket, 'close');
      expect((await post(status, { id: employeeId, active: false }, admin.token)).body.data.setAccountActive.active).toBe(false);
      expect((await closed)[0]).toBe(4401);
      expect(await db.session.count({ where: { userId: employeeId } })).toBe(0);
      expect((await post('{ me { id } }', {}, employeeToken)).status).toBe(401);
      const login = await post('mutation { signIn(email:"employee@example.com",password:"invitation-test-password") { token } }');
      expect(login.body.errors[0].message).toBe('Email or password is incorrect.');
    } finally { socket.terminate(); }
  });
  it('reactivates without restoring sessions, protects the administrator, and preserves account records', async () => {
    expect((await post(status, { id: employeeId, active: true }, admin.token)).body.data.setAccountActive.active).toBe(true);
    expect((await post('{ me { id } }', {}, employeeToken)).status).toBe(401);
    const login = await post('mutation { signIn(email:"employee@example.com",password:"invitation-test-password") { user { id role active } } }');
    expect(login.body.data.signIn.user).toEqual({ id: employeeId, role: 'EMPLOYEE', active: true });
    expect((await post(status, { id: admin.user.id, active: false }, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await post(status, { id: 'missing', active: false }, admin.token)).body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.user.id } })).active).toBe(true);
  });
  it('bounds invitation listing and does not expose token hashes', async () => {
    expect((await post('{ invitations(limit:1) { total items { id email } } }', {}, admin.token)).body.data.invitations.items).toHaveLength(1);
    expect((await post('{ invitations(limit:101) { total } }', {}, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await post('{ invitations { items { tokenHash } } }', {}, admin.token)).body.errors).toBeDefined();
  });
});
