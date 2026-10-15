import { beforeAll, afterAll, describe, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, subscribe } from 'graphql';
import type { ExecutionResult } from 'graphql';
import { createApplication } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { createSchema } from '../src/server.js';
import { createContext } from '../src/context.js';
import { resolveIdentity } from '../src/auth.js';
import { register } from '../src/accounts.js';
import { seedDatabase } from '../prisma/seed.js';
import { pubsub } from '../src/pubsub.js';
import { WebSocket } from 'ws';
import { once } from 'node:events';

describe('Account links and equipment privacy', () => {
  let directory: string;
  let db: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let admin: Awaited<ReturnType<typeof register>>;
  let first: Awaited<ReturnType<typeof register>>;
  let second: Awaited<ReturnType<typeof register>>;
  let firstEmployee: string;
  let secondEmployee: string;
  let equipmentId: string;
  const savedSecret = process.env.JWT_SECRET;
  const link = 'mutation($u:ID!,$e:ID) { linkAccountToEmployee(userId:$u,employeeId:$e) { id employee { id name } } }';
  const equipment = '{ myEquipment { id model serialNumber } }';
  async function post(query: string, variables = {}, token?: string) {
    const operation = request(app.app).post('/graphql').send({ query, variables });
    return token ? operation.set('Authorization', `Bearer ${token}`) : operation;
  }
  async function stream(token: string, document: string) {
    const result = await subscribe({ schema: createSchema(), document: parse(document), contextValue: createContext(db, await resolveIdentity(token, db)) });
    if (!(Symbol.asyncIterator in result)) throw new Error(JSON.stringify(result));
    return result as AsyncIterableIterator<ExecutionResult<Record<string, unknown>>>;
  }
  async function begin(iterator: AsyncIterableIterator<ExecutionResult<Record<string, unknown>>>) {
    const original = pubsub.subscribe.bind(pubsub);
    let ready!: () => void;
    const subscribed = new Promise<void>(resolve => { ready = resolve; });
    const spy = jest.spyOn(pubsub, 'subscribe').mockImplementation(async (name, handler) => {
      const id = await original(name, handler); ready(); return id;
    });
    const pending = iterator.next();
    await subscribed;
    spy.mockRestore();
    return { pending };
  }
  beforeAll(async () => {
    process.env.JWT_SECRET = 'account-linking-test-secret';
    directory = await mkdtemp(join(tmpdir(), 'directory-linking-'));
    db = createDatabase('file:' + join(directory, 'test.db').replaceAll('\\', '/'));
    for (const migration of (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort()) {
      const sql = await readFile(join('prisma/migrations', migration, 'migration.sql'), 'utf8');
      for (const statement of sql.split(';').filter(part => part.trim())) await db.$executeRawUnsafe(statement);
    }
    const seeded = await seedDatabase(db);
    firstEmployee = seeded.employees[0]!.id; secondEmployee = seeded.employees[1]!.id;
    equipmentId = (await db.equipment.findUniqueOrThrow({ where: { serialNumber: 'SN-001' } })).id;
    admin = await register(db, { name: 'Admin', email: 'admin@example.com', password: 'linking-test-password' });
    first = await register(db, { name: 'First', email: 'first@example.com', password: 'linking-test-password' });
    second = await register(db, { name: 'Second', email: 'second@example.com', password: 'linking-test-password' });
    app = await createApplication(db);
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    try { await app?.server.stop(); } finally {
      await db?.$disconnect();
      if (directory) await rm(directory, { recursive: true, force: true });
      if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
    }
  });
  it('keeps unlinked accounts private and restricts linking to admins', async () => {
    expect((await post(equipment, {}, first.token)).body.data.myEquipment).toEqual([]);
    expect((await post(link, { u: first.user.id, e: firstEmployee })).body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect((await post(link, { u: first.user.id, e: firstEmployee }, first.token)).body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect((await db.user.findUniqueOrThrow({ where: { id: first.user.id } })).employeeId).toBeNull();
  });
  it('links accounts explicitly, rejects duplicate and missing links, and preserves roles', async () => {
    expect((await post(link, { u: first.user.id, e: firstEmployee }, admin.token)).body.errors).toBeUndefined();
    expect((await post(link, { u: second.user.id, e: firstEmployee }, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await post(link, { u: second.user.id, e: 'missing' }, admin.token)).body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect((await post(link, { u: 'missing', e: secondEmployee }, admin.token)).body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect((await post(link, { u: second.user.id, e: secondEmployee }, admin.token)).body.errors).toBeUndefined();
    const identity = (await post('{ me { role employee { id } } }', {}, first.token)).body.data.me;
    expect(identity).toEqual({ role: 'EMPLOYEE', employee: { id: firstEmployee } });
  });
  it('exposes only personal equipment through direct and deeply nested queries', async () => {
    const own = await post(equipment, {}, first.token);
    expect(own.body.data.myEquipment).toHaveLength(2);
    expect((await post(equipment, {}, second.token)).body.data.myEquipment).toEqual([]);
    const query = '{ employees { id assignedEquipment { id serialNumber } team { members { id assignedEquipment { id serialNumber } } } } }';
    const response = await post(query, {}, first.token);
    expect(response.body.errors).toBeUndefined();
    for (const employee of response.body.data.employees) {
      if (employee.id !== firstEmployee) expect(employee.assignedEquipment).toEqual([]);
      for (const member of employee.team.members) if (member.id !== firstEmployee) expect(member.assignedEquipment).toEqual([]);
    }
    expect((await post(query, {}, admin.token)).body.data.employees.reduce((sum: number, employee: { assignedEquipment: unknown[] }) => sum + employee.assignedEquipment.length, 0)).toBe(4);
  });
  it('filters assignment streams and allows immediate cancellation while waiting', async () => {
    const iterator = await stream(first.token, 'subscription { equipmentAssigned { id serialNumber } }');
    try {
      const { pending } = await begin(iterator);
      const other = await db.equipment.findUniqueOrThrow({ where: { serialNumber: 'SN-002' } });
      const own = await db.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
      await pubsub.publish('EQUIPMENT_ASSIGNED', { equipmentAssigned: other });
      await pubsub.publish('EQUIPMENT_ASSIGNED', { equipmentAssigned: own });
      const result = await pending;
      expect(result.value?.errors).toBeUndefined();
      expect(result.value?.data?.equipmentAssigned).toEqual({ id: own.id, serialNumber: own.serialNumber });
      const waiting = iterator.next();
      await iterator.return?.();
      expect((await waiting).done).toBe(true);
    } finally { await iterator.return?.(); }
  });
  it('notifies the previous owner of reassignment without exposing the new owner or device', async () => {
    const iterator = await stream(first.token, 'subscription { myEquipmentChanged }');
    try {
      const { pending } = await begin(iterator);
      const assigned = await post('mutation($e:ID!,$q:ID!) { assignEquipment(employeeId:$e,equipmentId:$q) { id } }', { e: secondEmployee, q: equipmentId }, admin.token);
      expect(assigned.body.errors).toBeUndefined();
      expect((await pending).value?.data).toEqual({ myEquipmentChanged: true });
      expect((await post(equipment, {}, first.token)).body.data.myEquipment).toHaveLength(1);
      expect((await post(equipment, {}, second.token)).body.data.myEquipment).toHaveLength(1);
    } finally { await iterator.return?.(); }
  });
  it('can unlink an account without changing equipment ownership or role', async () => {
    expect((await post(link, { u: second.user.id, e: null }, admin.token)).body.data.linkAccountToEmployee.employee).toBeNull();
    expect((await post(equipment, {}, second.token)).body.data.myEquipment).toEqual([]);
    expect((await db.equipment.findUniqueOrThrow({ where: { id: equipmentId } })).assignedToId).toBe(secondEmployee);
    expect((await db.user.findUniqueOrThrow({ where: { id: second.user.id } })).role).toBe('EMPLOYEE');
  });
  it('closes active sockets when a link changes while keeping the session valid', async () => {
    await new Promise<void>(resolve => app.httpServer.listen(0, '127.0.0.1', resolve));
    const address = app.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('No listener');
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/graphql`, 'graphql-transport-ws');
    try {
      await once(socket, 'open');
      const acknowledged = once(socket, 'message');
      socket.send(JSON.stringify({ type: 'connection_init', payload: { authToken: second.token } }));
      expect(JSON.parse(String((await acknowledged)[0])).type).toBe('connection_ack');
      const closed = once(socket, 'close');
      expect((await post(link, { u: second.user.id, e: secondEmployee }, admin.token)).body.errors).toBeUndefined();
      expect((await closed)[0]).toBe(4401);
      const fresh = await post(equipment, {}, second.token);
      expect(fresh.status).toBe(200);
      expect(fresh.body.data.myEquipment).toHaveLength(1);
    } finally { socket.terminate(); }
  });
});
