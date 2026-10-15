import assert from 'node:assert/strict';
import { jest, test } from '@jest/globals';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.js';
import { createContext } from '../src/context.js';
import { createDatabase } from '../src/db.js';
import { seedDatabase } from '../prisma/seed.js';
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { createApplication } from '../src/app.js';
import { pubsub } from '../src/pubsub.js';
const admin = { id: 'test-admin', email: 'admin@example.com', role: 'ADMIN' } as const;
interface OperationData {
  employees: { id: string }[];
  createEmployee: { name: string; email: string; team: { members: { id: string }[] }; assignedEquipment: { id: string }[] };
  assignEquipment: { assignedTo: { id: string } };
}

test('Prisma GraphQL persistence, validation, batching, and cache invalidation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'directory-api-'));
  const url = 'file:' + join(directory, 'test.db').replaceAll('\\', '/');
  const db = createDatabase(url);
  const server = createServer();
  async function execute(query: string, variables?: Record<string, unknown>, contextValue = createContext(db, admin)) {
    const result = await server.executeOperation<OperationData>({ query, ...(variables ? { variables } : {}) }, { contextValue });
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
    const assignment = 'mutation($e: ID!, $q: ID!) { assignEquipment(employeeId: $e, equipmentId: $q) { id } }';
    for (const [user, code] of [[null, 'UNAUTHENTICATED'], [{ ...admin, role: 'EMPLOYEE' as const }, 'FORBIDDEN']] as const) {
      const denied = await execute(assignment, { e: liam.id, q: equipment.id }, createContext(db, user));
      assert.equal(denied.errors?.[0]?.extensions?.code, code);
      assert.equal((await db.equipment.findUniqueOrThrow({ where: { id: equipment.id } })).assignedToId, asha.id);
    }
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
    const context = createContext(db, admin);
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

    // Exercise real HTTP headers and graphql-transport-ws against the same schema/database.
    const previousSecret = process.env.JWT_SECRET;
    const previousDemo = process.env.AUTH_DEMO_MODE;
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.AUTH_DEMO_MODE = 'false';
    const application = await createApplication(db);
    let socket: WebSocket | undefined;
    try {
      await new Promise<void>(resolve => application.httpServer.listen(0, '127.0.0.1', resolve));
      const address = application.httpServer.address();
      assert.ok(address && typeof address !== 'string');
      const endpoint = 'http://127.0.0.1:' + address.port + '/graphql';
      const token = jwt.sign({ sub: admin.id, email: admin.email, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const employeeToken = jwt.sign({ sub: 'employee', email: 'e@example.com', role: 'EMPLOYEE' }, process.env.JWT_SECRET);
      async function post(authorization?: string) {
        const response = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
          body: JSON.stringify({ query: assignment, variables: { e: asha!.id, q: equipment.id } }),
        });
        return response.json();
      }
      assert.equal((await post()).errors[0].extensions.code, 'UNAUTHENTICATED');
      assert.equal((await post('Bearer ' + employeeToken)).errors[0].extensions.code, 'FORBIDDEN');
      assert.equal((await post('Bearer invalid')).errors[0].extensions.code, 'UNAUTHENTICATED');
      socket = new WebSocket(endpoint.replace('http:', 'ws:'), 'graphql-transport-ws');
      await once(socket, 'open');
      let message = once(socket, 'message');
      socket.send(JSON.stringify({ type: 'connection_init', payload: { authToken: token } }));
      assert.equal(JSON.parse(String((await message)[0])).type, 'connection_ack');
      const originalSubscribe = pubsub.subscribe.bind(pubsub);
      let markSubscribed!: () => void;
      const subscribed = new Promise<void>(resolve => { markSubscribed = resolve; });
      const subscribeSpy = jest.spyOn(pubsub, 'subscribe').mockImplementation(async (trigger, onMessage) => {
        const id = await originalSubscribe(trigger, onMessage);
        markSubscribed();
        return id;
      });
      socket.send(JSON.stringify({ id: 'assignment', type: 'subscribe', payload: {
        query: 'subscription { equipmentAssigned { id assignedTo { id assignedEquipment { id } } } }',
      } }));
      await subscribed;
      subscribeSpy.mockRestore();
      message = once(socket, 'message');
      assert.equal((await post('Bearer ' + token)).errors, undefined);
      const event = JSON.parse(String((await message)[0]));
      assert.equal(event.type, 'next');
      assert.equal(event.payload.data.equipmentAssigned.id, equipment.id);
      assert.equal(event.payload.data.equipmentAssigned.assignedTo.id, asha.id);
      assert.equal(event.payload.data.equipmentAssigned.assignedTo.assignedEquipment.length, 2);
      // A second event on the same subscription must not reuse old relation caches.
      message = once(socket, 'message');
      await execute(assignment, { e: liam.id, q: equipment.id });
      const second = JSON.parse(String((await message)[0]));
      assert.equal(second.payload.data.equipmentAssigned.assignedTo.id, liam.id);
      assert.equal(second.payload.data.equipmentAssigned.assignedTo.assignedEquipment.length, 1);
      socket.close();
      await once(socket, 'close');
      socket = new WebSocket(endpoint.replace('http:', 'ws:'), 'graphql-transport-ws');
      await once(socket, 'open');
      const closed = once(socket, 'close');
      socket.send(JSON.stringify({ type: 'connection_init', payload: { authToken: 'invalid' } }));
      assert.equal((await closed)[0], 4403);
    } finally {
      jest.restoreAllMocks();
      socket?.terminate();
      await application.server.stop();
      if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
      if (previousDemo === undefined) delete process.env.AUTH_DEMO_MODE; else process.env.AUTH_DEMO_MODE = previousDemo;
    }
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

