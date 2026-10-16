import { createTestSchema, applyTestMigrations, dropTestSchema } from './database.js';
import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApplication } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { registerTestUser as register } from './helpers/register.js';
import { seedDatabase } from '../prisma/seed.js';

describe('Admin equipment inventory', () => {
  let directory: string;
  let db: ReturnType<typeof createDatabase>;
  let application: Awaited<ReturnType<typeof createApplication>>;
  let admin: string;
  let employee: string;
  let employeeId: string;
  let equipmentId: string;
  const savedSecret = process.env.JWT_SECRET;
  const list = `query($search:String,$assigned:Boolean,$offset:Int,$limit:Int) {
    equipmentInventory(search:$search,assigned:$assigned,offset:$offset,limit:$limit) {
      total items { id type model serialNumber assignedTo { id name } }
    }
  }`;
  const create = 'mutation($input:EquipmentInput!) { createEquipment(input:$input) { id type model serialNumber assignedTo { id } } }';
  const update = 'mutation($id:ID!,$input:EquipmentInput!) { updateEquipment(id:$id,input:$input) { id type model serialNumber assignedTo { id } } }';
  const input = { type: ' Laptop ', model: ' Test Workstation ', serialNumber: ' poc-005 ' };
  async function post(query: string, variables = {}, token?: string) {
    const operation = request(application.app).post('/graphql').send({ query, variables });
    return token ? operation.set('Authorization', `Bearer ${token}`) : operation;
  }
  beforeAll(async () => {
    process.env.JWT_SECRET = 'inventory-tests-secret';
    directory = await createTestSchema();
    db = createDatabase(directory);
    await applyTestMigrations(db, directory);
    const seeded = await seedDatabase(db);
    employeeId = seeded.employees[0]!.id;
    admin = (await register(db, { name: 'Admin', email: 'admin@example.com', password: 'inventory-test-password' })).token;
    employee = (await register(db, { name: 'Employee', email: 'employee@example.com', password: 'inventory-test-password' })).token;
    application = await createApplication(db);
  });
  afterAll(async () => {
    try { await application?.server.stop(); } finally {
      await db?.$disconnect();
      if (directory) await dropTestSchema(directory);
      if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
    }
  });
  it.each([['anonymous', undefined, 'UNAUTHENTICATED'], ['employee', 'employee', 'FORBIDDEN']])('blocks %s access for listing, creation, and editing', async (_, identity, code) => {
    const token = identity ? employee : undefined;
    for (const [query, variables] of [[list, {}], [create, { input }], [update, { id: 'missing', input }]] as const) {
      const response = await post(query, variables, token);
      expect(response.body.errors[0].extensions.code).toBe(code);
    }
    expect(await db.equipment.count()).toBe(4);
  });
  it('creates an unassigned device with a normalized unique serial number', async () => {
    const response = await post(create, { input }, admin);
    expect(response.body.errors).toBeUndefined();
    const item = response.body.data.createEquipment;
    equipmentId = item.id;
    expect(item).toEqual({ id: equipmentId, type: 'Laptop', model: 'Test Workstation', serialNumber: 'POC-005', assignedTo: null });
    expect((await db.equipment.findUniqueOrThrow({ where: { id: equipmentId } })).assignedToId).toBeNull();
  });
  it('searches and filters assigned/unassigned devices with bounded pagination', async () => {
    const found = await post(list, { search: 'poc-005', assigned: false }, admin);
    expect(found.body.data.equipmentInventory.total).toBe(1);
    expect(found.body.data.equipmentInventory.items[0].id).toBe(equipmentId);
    expect((await post(list, { assigned: true }, admin)).body.data.equipmentInventory.total).toBe(4);
    const first = (await post(list, { limit: 2 }, admin)).body.data.equipmentInventory;
    const second = (await post(list, { limit: 2, offset: 2 }, admin)).body.data.equipmentInventory;
    expect(first.total).toBe(5);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((item: { id: string }) => item.id)).size).toBe(4);
    for (const variables of [{ limit: 101 }, { limit: 0 }, { offset: -1 }, { search: 'x'.repeat(101) }]) {
      expect((await post(list, variables, admin)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    }
  });
  it('rejects duplicate serials and invalid fields without writing', async () => {
    const duplicate = await post(create, { input }, admin);
    expect(duplicate.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(duplicate.body.errors[0].message).toContain('serial number');
    for (const invalid of [{ ...input, type: ' ' }, { ...input, model: 'x'.repeat(101) }, { ...input, serialNumber: ' ' }, { ...input, model: 'bad\nmodel' }]) {
      expect((await post(create, { input: invalid }, admin)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect((await post(update, { id: equipmentId, input: invalid }, admin)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    }
    expect(await db.equipment.count()).toBe(5);
  });
  it('assigns a newly created device and edits metadata without changing its owner', async () => {
    const assigned = await post('mutation($e:ID!,$q:ID!) { assignEquipment(employeeId:$e,equipmentId:$q) { id assignedTo { id } } }', { e: employeeId, q: equipmentId }, admin);
    expect(assigned.body.errors).toBeUndefined();
    const edited = await post(update, { id: equipmentId, input: { type: 'Laptop', model: 'Updated Workstation', serialNumber: 'POC-006' } }, admin);
    expect(edited.body.errors).toBeUndefined();
    expect(edited.body.data.updateEquipment.assignedTo.id).toBe(employeeId);
    expect((await db.equipment.findUniqueOrThrow({ where: { id: equipmentId } })).model).toBe('Updated Workstation');
    expect((await post(list, { search: 'POC-006', assigned: true }, admin)).body.data.equipmentInventory.total).toBe(1);
    expect((await post(list, { assigned: false }, admin)).body.data.equipmentInventory.total).toBe(0);
  });
  it('rejects missing IDs and duplicate serial edits without corrupting the device', async () => {
    expect((await post(update, { id: 'missing', input }, admin)).body.errors[0].extensions.code).toBe('NOT_FOUND');
    const duplicate = await post(update, { id: equipmentId, input: { ...input, serialNumber: 'sn-001' } }, admin);
    expect(duplicate.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const unchanged = await db.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
    expect(unchanged.serialNumber).toBe('POC-006');
    expect(unchanged.assignedToId).toBe(employeeId);
  });
});
