import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.js';
import { createContext } from '../src/context.js';
import { createDatabase } from '../src/db.js';
import { seedDatabase } from '../prisma/seed.js';

test('Prisma GraphQL persistence, validation, batching, and cache invalidation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'directory-api-'));
  const url = 'file:' + join(directory, 'test.db').replaceAll('\\', '/');
  const db = createDatabase(url);
  const server = createServer();
  async function execute(query: string, variables?: Record<string, unknown>, contextValue = createContext(db)) {
    const result = await server.executeOperation({ query, variables }, { contextValue });
    assert.equal(result.body.kind, 'single');
    if (result.body.kind !== 'single') throw new Error('Unexpected incremental response');
    return result.body.singleResult;
  }
  try {
    const migrations = (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort();
    for (const migration of migrations) {
      const sql = await readFile(join('prisma/migrations', migration, 'migration.sql'), 'utf8');
      for (const statement of sql.split(';').filter(part => part.trim())) await db.$executeRawUnsafe(statement);
    }
    let seeded = await seedDatabase(db);
    seeded = await seedDatabase(db);
    assert.equal(await db.team.count(), 2);
    assert.equal(await db.employee.count(), 4);
    assert.equal(await db.equipment.count(), 4);
    const [asha, liam] = seeded.employees;
    const team = seeded.teams[0]!;
    assert.ok(asha && liam);
    assert.match(asha.id, /^[0-9a-f-]{36}$/);
    const equipment = await db.equipment.findFirstOrThrow({ where: { serialNumber: 'SN-001' } });
    let teamBatches = 0;
    let equipmentBatches = 0;
    const originalTeams = db.team.findMany.bind(db.team);
    const originalEquipment = db.equipment.findMany.bind(db.equipment);
    db.team.findMany = ((...args: Parameters<typeof originalTeams>) => { teamBatches++; return originalTeams(...args); }) as typeof db.team.findMany;
    db.equipment.findMany = ((...args: Parameters<typeof originalEquipment>) => { equipmentBatches++; return originalEquipment(...args); }) as typeof db.equipment.findMany;
    const graph = await execute('{ employees { id team { id members { id } } assignedEquipment { id assignedTo { id } } } }');
    assert.equal(graph.errors, undefined);
    assert.equal(graph.data?.employees.length, 4);
    assert.equal(teamBatches, 1);
    assert.equal(equipmentBatches, 1);
    assert.equal((await execute('{ employees(role: "Engineer") { id } }')).data?.employees.length, 2);
    for (const [query, variables] of [
      ['query($id: ID!) { employee(id: $id) { id } }', { id: 'missing' }],
      ['mutation($e: ID!, $q: ID!) { assignEquipment(employeeId: $e, equipmentId: $q) { id } }', { e: 'missing', q: equipment.id }],
      ['mutation($e: ID!, $q: ID!) { assignEquipment(employeeId: $e, equipmentId: $q) { id } }', { e: asha.id, q: 'missing' }],
    ] as const) assert.equal((await execute(query, variables)).errors?.[0]?.extensions?.code, 'NOT_FOUND');
    for (const [input, code] of [
      [{ name: ' ', email: 'new@example.com', role: 'Engineer', teamId: team.id }, 'BAD_USER_INPUT'],
      [{ name: 'New', email: 'invalid', role: 'Engineer', teamId: team.id }, 'BAD_USER_INPUT'],
      [{ name: 'New', email: 'ASHA@example.com', role: 'Engineer', teamId: team.id }, 'BAD_USER_INPUT'],
      [{ name: 'New', email: 'new@example.com', role: 'Engineer', teamId: 'missing' }, 'NOT_FOUND'],
    ] as const) {
      assert.equal((await execute('mutation($input: PublicEmployeeInput!) { createEmployee(input: $input) { id } }', { input })).errors?.[0]?.extensions?.code, code);
    }
    const context = createContext(db);
    await context.loaders.members.load(team.id);
    const created = await execute('mutation($input: PublicEmployeeInput!) { createEmployee(input: $input) { id name email team { members { id } } assignedEquipment { id } } }', {
      input: { name: ' New Person ', email: 'NEW@example.com', role: 'Engineer', teamId: team.id },
    }, context);
    assert.equal(created.errors, undefined);
    assert.equal(created.data?.createEmployee.email, 'new@example.com');
    assert.equal(created.data?.createEmployee.name, 'New Person');
    assert.equal(created.data?.createEmployee.team.members.length, 3);
    assert.deepEqual(created.data?.createEmployee.assignedEquipment, []);
    await context.loaders.equipment.load(asha.id);
    await context.loaders.equipment.load(liam.id);
    const reassigned = await execute('mutation($e: ID!, $q: ID!) { assignEquipment(employeeId: $e, equipmentId: $q) { assignedTo { id assignedEquipment { id } } } }', { e: liam.id, q: equipment.id }, context);
    assert.equal(reassigned.errors, undefined);
    assert.equal(reassigned.data?.assignEquipment.assignedTo.id, liam.id);
    assert.equal((await context.loaders.equipment.load(asha.id)).length, 1);
    assert.equal((await context.loaders.equipment.load(liam.id)).length, 1);
    assert.notEqual(createContext(db).loaders.team, createContext(db).loaders.team);
    await assert.rejects(db.employee.create({ data: { name: 'Invalid', email: 'fk@example.com', role: 'Engineer', teamId: 'missing' } }));
    await db.$disconnect();
    const reopened = createDatabase(url);
    try { assert.equal(await reopened.employee.count(), 5); }
    finally { await reopened.$disconnect(); }
  } finally {
    await server.stop();
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});

