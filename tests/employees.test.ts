import { createTestSchema, applyTestMigrations, dropTestSchema } from './database.js';
import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApplication } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { registerTestUser } from './helpers/register.js';

describe('Employee management and account onboarding', () => {
  let directory: string;
  let db: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let admin: Awaited<ReturnType<typeof registerTestUser>>;
  let employee: Awaited<ReturnType<typeof registerTestUser>>;
  let otherAccount: Awaited<ReturnType<typeof registerTestUser>>;
  let teamId: string;
  let employeeId: string;
  let deviceId: string;
  const savedSecret = process.env.JWT_SECRET;
  const create = 'mutation($input:PublicEmployeeInput!) { createEmployee(input:$input) { id name email role team { id } assignedEquipment { id } } }';
  const update = 'mutation($id:ID!,$input:PublicEmployeeInput!) { updateEmployee(id:$id,input:$input) { id name email role team { id members { id } } assignedEquipment { id } } }';
  const createLinked = 'mutation($u:ID!,$input:PublicEmployeeInput!) { createEmployeeForAccount(userId:$u,input:$input) { id name email team { id } } }';
  const list = 'query($search:String,$team:ID,$offset:Int,$limit:Int) { employeeManagement(search:$search,teamId:$team,offset:$offset,limit:$limit) { total items { id name email role team { id } } } }';
  async function post(query: string, variables = {}, token?: string) {
    const operation = request(app.app).post('/graphql').send({ query, variables });
    return token ? operation.set('Authorization', `Bearer ${token}`) : operation;
  }
  const input = () => ({ name: ' New Person ', email: ' NEW@EXAMPLE.COM ', role: ' Engineer ', teamId });
  beforeAll(async () => {
    process.env.JWT_SECRET = 'employee-management-test-secret';
    directory = await createTestSchema();
    db = createDatabase(directory);
    await applyTestMigrations(db, directory);
    admin = await registerTestUser(db, { name: 'Admin', email: 'admin@example.com', password: 'employee-test-password' });
    employee = await registerTestUser(db, { name: 'New Person', email: 'new@example.com', password: 'employee-test-password' });
    otherAccount = await registerTestUser(db, { name: 'Other', email: 'other@example.com', password: 'employee-test-password' });
    app = await createApplication(db);
  });
  afterAll(async () => {
    try { await app?.server.stop(); } finally {
      await db?.$disconnect();
      if (directory) await dropTestSchema(directory);
      if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
    }
  });
  it('blocks non-admin management, updates, team creation, and account onboarding', async () => {
    for (const [token, code] of [[undefined, 'UNAUTHENTICATED'], [employee.token, 'FORBIDDEN']] as const) {
      for (const [query, variables] of [[list, {}], [create, { input: { ...input(), teamId: 'missing' } }], [update, { id: 'missing', input: { ...input(), teamId: 'missing' } }], [createLinked, { u: employee.user.id, input: { ...input(), teamId: 'missing' } }], ['mutation { createTeam(name:"Platform",department:"Engineering") { id } }', {}]] as const) {
        expect((await post(query, variables, token)).body.errors[0].extensions.code).toBe(code);
      }
    }
    expect(await db.employee.count()).toBe(0); expect(await db.team.count()).toBe(0);
  });
  it('creates a team so an empty workspace can onboard without seeded data', async () => {
    const result = await post('mutation { createTeam(name:" Platform ",department:" Engineering ") { id name department } }', {}, admin.token);
    expect(result.body.errors).toBeUndefined();
    teamId = result.body.data.createTeam.id;
    expect(result.body.data.createTeam).toEqual({ id: teamId, name: 'Platform', department: 'Engineering' });
    expect((await post('mutation { createTeam(name:" ",department:"Engineering") { id } }', {}, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
  it('creates and links an employee in one step, with normalized directory details', async () => {
    const result = await post(createLinked, { u: employee.user.id, input: input() }, admin.token);
    expect(result.body.errors).toBeUndefined();
    employeeId = result.body.data.createEmployeeForAccount.id;
    expect(result.body.data.createEmployeeForAccount).toEqual({ id: employeeId, name: 'New Person', email: 'new@example.com', team: { id: teamId } });
    expect((await post('{ me { role employee { id } } }', {}, employee.token)).body.data.me).toEqual({ role: 'EMPLOYEE', employee: { id: employeeId } });
    const before = await db.employee.count();
    expect((await post(createLinked, { u: employee.user.id, input: { ...input(), email: 'stray@example.com' } }, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(await db.employee.count()).toBe(before);
  });
  it('rolls back onboarding on duplicate email or missing/inactive account', async () => {
    const before = await db.employee.count();
    expect((await post(createLinked, { u: otherAccount.user.id, input: input() }, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await db.user.findUniqueOrThrow({ where: { id: otherAccount.user.id } })).employeeId).toBeNull();
    expect((await post(createLinked, { u: 'missing', input: { ...input(), email: 'missing@example.com' } }, admin.token)).body.errors[0].extensions.code).toBe('NOT_FOUND');
    await db.user.update({ where: { id: otherAccount.user.id }, data: { active: false } });
    expect((await post(createLinked, { u: otherAccount.user.id, input: { ...input(), email: 'inactive@example.com' } }, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    await db.user.update({ where: { id: otherAccount.user.id }, data: { active: true } });
    expect(await db.employee.count()).toBe(before);
  });
  it('edits directory details and teams without changing links, equipment, account email, or permissions', async () => {
    const nextTeam = await db.team.create({ data: { name: 'Experience', department: 'Design' } });
    deviceId = (await db.equipment.create({ data: { type: 'Laptop', model: 'Test device', serialNumber: 'EMP-001', assignedToId: employeeId } })).id;
    const changed = await post(update, { id: employeeId, input: { name: 'Updated Person', email: 'work@example.com', role: 'Lead Engineer', teamId: nextTeam.id } }, admin.token);
    expect(changed.body.errors).toBeUndefined();
    expect(changed.body.data.updateEmployee).toMatchObject({ id: employeeId, name: 'Updated Person', email: 'work@example.com', role: 'Lead Engineer', team: { id: nextTeam.id }, assignedEquipment: [{ id: deviceId }] });
    expect((await db.team.findUniqueOrThrow({ where: { id: teamId }, include: { members: true } })).members).toHaveLength(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: employee.user.id } }))).toMatchObject({ email: 'new@example.com', role: 'EMPLOYEE', employeeId });
    expect((await post('{ myEquipment { id } }', {}, employee.token)).body.data.myEquipment).toEqual([{ id: deviceId }]);
  });
  it('supports standalone employee creation, search, team filters, and pagination', async () => {
    const result = await post(create, { input: { name: 'Second Person', email: 'second@example.com', role: 'Designer', teamId } }, admin.token);
    expect(result.body.errors).toBeUndefined(); expect(result.body.data.createEmployee.assignedEquipment).toEqual([]);
    expect((await post(list, { search: 'lead' }, admin.token)).body.data.employeeManagement.total).toBe(1);
    expect((await post(list, { team: teamId }, admin.token)).body.data.employeeManagement.total).toBe(1);
    expect((await post(list, { limit: 1 }, admin.token)).body.data.employeeManagement.items).toHaveLength(1);
    expect((await post(list, { limit: 1, offset: 1 }, admin.token)).body.data.employeeManagement.items).toHaveLength(1);
    for (const variables of [{ limit: 101 }, { offset: -1 }, { search: 'x'.repeat(101) }]) expect((await post(list, variables, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
  it('validates edits and preserves the record on duplicate/invalid input', async () => {
    for (const data of [{ ...input(), role: ' ' }, { ...input(), role: 'x'.repeat(101) }, { ...input(), email: 'invalid' }, { ...input(), teamId: '' }]) {
      expect((await post(update, { id: employeeId, input: data }, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    }
    expect((await post(update, { id: employeeId, input: { ...input(), teamId: 'missing' } }, admin.token)).body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect((await post(update, { id: 'missing', input: input() }, admin.token)).body.errors[0].extensions.code).toBe('NOT_FOUND');
    const before = await db.employee.count();
    expect((await post(update, { id: '', input: { ...input(), email: 'stray-empty-id@example.com' } }, admin.token)).body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect((await post(createLinked, { u: '', input: { ...input(), email: 'stray-empty-account@example.com' } }, admin.token)).body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect(await db.employee.count()).toBe(before);
    expect((await post(update, { id: employeeId, input: { ...input(), email: 'SECOND@example.com' } }, admin.token)).body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect((await db.employee.findUniqueOrThrow({ where: { id: employeeId } })).email).toBe('work@example.com');
    expect((await db.equipment.findUniqueOrThrow({ where: { id: deviceId } })).assignedToId).toBe(employeeId);
  });
});
