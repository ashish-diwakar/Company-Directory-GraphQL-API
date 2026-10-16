import { createTestSchema, applyTestMigrations, dropTestSchema } from './database.js';
import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApplication } from '../src/application.js';
import { createDatabase } from '../src/db.js';
import { registerTestUser as register } from './helpers/register.js';
import { seedDatabase } from '../prisma/seed.js';
import { pubsub } from '../src/pubsub.js';
import { parse, subscribe } from 'graphql';
import { createSchema } from '../src/server.js';
import { createContext } from '../src/context.js';
import { resolveIdentity } from '../src/auth.js';

describe('Transactional assignment history and device returns', () => {
  let directory: string;
  let db: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let admin: Awaited<ReturnType<typeof register>>;
  let employee: Awaited<ReturnType<typeof register>>;
  let firstId: string;
  let secondId: string;
  let deviceId: string;
  const savedSecret = process.env.JWT_SECRET;
  const events: string[] = [];
  const personalTargets: string[][] = [];
  const subscriptions: number[] = [];
  const history = `query($id:ID,$offset:Int,$limit:Int) { equipmentHistory(equipmentId:$id,offset:$offset,limit:$limit) {
    total items { id action actorId actorName actorEmail equipmentId equipmentModel serialNumber fromEmployeeId fromEmployeeName toEmployeeId toEmployeeName notes createdAt }
  } }`;
  const assign = 'mutation($e:ID!,$q:ID!) { assignEquipment(employeeId:$e,equipmentId:$q) { id assignedTo { id } } }';
  const returnDevice = 'mutation($q:ID!,$owner:ID!,$notes:String) { returnEquipment(equipmentId:$q,expectedEmployeeId:$owner,notes:$notes) { id assignedTo { id } } }';
  async function post(query: string, variables = {}, token?: string) {
    const operation = request(app.app).post('/graphql').send({ query, variables });
    return token ? operation.set('Authorization', `Bearer ${token}`) : operation;
  }
  beforeAll(async () => {
    process.env.JWT_SECRET = 'equipment-history-test-secret';
    directory = await createTestSchema();
    db = createDatabase(directory);
    await applyTestMigrations(db, directory);
    const seed = await seedDatabase(db);
    firstId = seed.employees[0]!.id; secondId = seed.employees[1]!.id;
    deviceId = (await db.equipment.create({ data: { type: 'Laptop', model: 'History Device', serialNumber: 'AUDIT-001' } })).id;
    admin = await register(db, { name: 'History Admin', email: 'admin@example.com', password: 'history-test-password' });
    employee = await register(db, { name: 'Employee', email: 'employee@example.com', password: 'history-test-password' });
    await db.user.update({ where: { id: employee.user.id }, data: { employeeId: firstId } });
    app = await createApplication(db);
    subscriptions.push(await pubsub.subscribe('EQUIPMENT_ASSIGNED', () => { events.push('assigned'); }));
    subscriptions.push(await pubsub.subscribe('EQUIPMENT_RETURNED', () => { events.push('returned'); }));
    subscriptions.push(await pubsub.subscribe('MY_EQUIPMENT_CHANGED', payload => { events.push('personal'); personalTargets.push(payload.employeeIds); }));
  });
  afterAll(async () => {
    for (const id of subscriptions) pubsub.unsubscribe(id);
    try { await app?.server.stop(); } finally {
      await db?.$disconnect();
      if (directory) await dropTestSchema(directory);
      if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
    }
  });
  it('restricts return actions and assignment history to admins', async () => {
    for (const [token, code] of [[undefined, 'UNAUTHENTICATED'], [employee.token, 'FORBIDDEN']] as const) {
      expect((await post(history, {}, token)).body.errors[0].extensions.code).toBe(code);
      expect((await post(returnDevice, { q: deviceId, owner: firstId }, token)).body.errors[0].extensions.code).toBe(code);
    }
    expect(await db.assignmentEvent.count()).toBe(0);
    expect(events).toEqual([]);
  });
  it('records assignment with actor/device/owner snapshots and avoids duplicate changes', async () => {
    expect((await post(assign, { e: firstId, q: deviceId }, admin.token)).body.errors).toBeUndefined();
    const first = (await post(history, { id: deviceId }, admin.token)).body.data.equipmentHistory;
    expect(first.total).toBe(1);
    expect(first.items[0]).toMatchObject({ action: 'ASSIGNED', actorId: admin.user.id, actorName: 'History Admin', actorEmail: 'admin@example.com', equipmentModel: 'History Device', serialNumber: 'AUDIT-001', fromEmployeeId: null, toEmployeeId: firstId, toEmployeeName: 'Asha Patel' });
    expect(Number.isNaN(Date.parse(first.items[0].createdAt))).toBe(false);
    const before = [...events];
    expect((await post(assign, { e: firstId, q: deviceId }, admin.token)).body.errors).toBeUndefined();
    expect(await db.assignmentEvent.count()).toBe(1);
    expect(events).toEqual(before);
  });
  it('records reassignment and rejects stale return confirmations', async () => {
    expect((await post(assign, { e: secondId, q: deviceId }, admin.token)).body.errors).toBeUndefined();
    const before = [...events];
    const stale = await post(returnDevice, { q: deviceId, owner: firstId }, admin.token);
    expect(stale.body.errors[0].extensions.code).toBe('CONFLICT');
    expect((await db.equipment.findUniqueOrThrow({ where: { id: deviceId } })).assignedToId).toBe(secondId);
    expect(await db.assignmentEvent.count()).toBe(2);
    expect(events).toEqual(before);
    expect((await db.assignmentEvent.findFirstOrThrow({ where: { action: 'REASSIGNED' } }))).toMatchObject({ fromEmployeeId: firstId, fromEmployeeName: 'Asha Patel', toEmployeeId: secondId, toEmployeeName: 'Liam Chen' });
  });
  it('returns to stock, records notes, notifies owners, and makes repeats idempotent', async () => {
    const returned = await post(returnDevice, { q: deviceId, owner: secondId, notes: '  Charger received; good condition.  ' }, admin.token);
    expect(returned.body.errors).toBeUndefined();
    expect(returned.body.data.returnEquipment.assignedTo).toBeNull();
    expect((await db.assignmentEvent.findFirstOrThrow({ where: { action: 'RETURNED' } }))).toMatchObject({ fromEmployeeId: secondId, toEmployeeId: null, notes: 'Charger received; good condition.' });
    expect(events.slice(-2)).toEqual(['returned', 'personal']);
    expect(personalTargets.at(-1)).toEqual([secondId]);
    const before = [...events];
    expect((await post(returnDevice, { q: deviceId, owner: secondId }, admin.token)).body.errors).toBeUndefined();
    expect(await db.assignmentEvent.count()).toBe(3);
    expect(events).toEqual(before);
  });
  it('delivers detailed return events only to admins', async () => {
    const document = parse('subscription { equipmentReturned { id model serialNumber } }');
    const schema = createSchema();
    const adminStream = await subscribe({ schema, document, contextValue: createContext(db, await resolveIdentity(admin.token, db)) });
    const employeeStream = await subscribe({ schema, document, contextValue: createContext(db, await resolveIdentity(employee.token, db)) });
    if (!(Symbol.asyncIterator in adminStream) || !(Symbol.asyncIterator in employeeStream)) throw new Error('Expected subscriptions');
    try {
      const adminNext = adminStream.next();
      const employeeNext = employeeStream.next();
      await new Promise<void>(resolve => setImmediate(resolve));
      const item = await db.equipment.findUniqueOrThrow({ where: { id: deviceId } });
      await pubsub.publish('EQUIPMENT_RETURNED', { equipmentReturned: item });
      expect((await adminNext).value?.data).toEqual({ equipmentReturned: { id: deviceId, model: 'History Device', serialNumber: 'AUDIT-001' } });
      await employeeStream.return?.();
      expect((await employeeNext).done).toBe(true);
    } finally { await adminStream.return?.(); await employeeStream.return?.(); }
  });
  it('rolls back ownership if writing the audit record fails, with no broadcasts', async () => {
    const before = [...events];
    const schema = new URL(directory).searchParams.get('schema')!;
    await db.$executeRawUnsafe(`CREATE FUNCTION "${schema}".fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit unavailable'; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_audit BEFORE INSERT ON "${schema}"."AssignmentEvent" FOR EACH ROW EXECUTE FUNCTION "${schema}".fail_audit()`);
    try {
      expect((await post(assign, { e: firstId, q: deviceId }, admin.token)).body.errors).toBeDefined();
      expect((await db.equipment.findUniqueOrThrow({ where: { id: deviceId } })).assignedToId).toBeNull();
      expect(await db.assignmentEvent.count()).toBe(3);
      expect(events).toEqual(before);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER fail_audit ON "${schema}"."AssignmentEvent"`);
      await db.$executeRawUnsafe(`DROP FUNCTION "${schema}".fail_audit()`);
    }
  });
  it('preserves historical snapshots after metadata edits and directory reseeding', async () => {
    await db.equipment.update({ where: { id: deviceId }, data: { model: 'Renamed', serialNumber: 'NEW-SERIAL' } });
    await db.employee.update({ where: { id: firstId }, data: { name: 'Renamed Employee' } });
    await db.user.update({ where: { id: admin.user.id }, data: { name: 'Renamed Admin' } });
    await seedDatabase(db);
    const result = (await post(history, { id: deviceId }, admin.token)).body.data.equipmentHistory;
    expect(result.total).toBe(3);
    expect(result.items.every((item: { equipmentModel: string; serialNumber: string; actorName: string }) => item.equipmentModel === 'History Device' && item.serialNumber === 'AUDIT-001' && item.actorName === 'History Admin')).toBe(true);
    expect(result.items.find((item: { action: string }) => item.action === 'ASSIGNED').toEmployeeName).toBe('Asha Patel');
  });
  it('paginates history and rejects invalid/missing return input without adding history', async () => {
    const first = (await post(history, { limit: 1 }, admin.token)).body.data.equipmentHistory;
    const second = (await post(history, { limit: 1, offset: 1 }, admin.token)).body.data.equipmentHistory;
    expect(first.total).toBe(3); expect(first.items[0].id).not.toBe(second.items[0].id);
    for (const variables of [{ limit: 0 }, { limit: 101 }, { offset: -1 }]) expect((await post(history, variables, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await post(returnDevice, { q: 'missing', owner: firstId }, admin.token)).body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect((await post(returnDevice, { q: 'missing', owner: firstId, notes: 'x'.repeat(501) }, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(await db.assignmentEvent.count()).toBe(3);
  });
});
