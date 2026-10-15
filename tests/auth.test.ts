import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { seedDatabase } from '../prisma/seed.js';
import { pubsub } from '../src/pubsub.js';

const secret = 'rbac-integration-test-secret-only';
const mutation = `mutation TestAssign($employeeId: ID!, $equipmentId: ID!) {
  assignEquipment(employeeId: $employeeId, equipmentId: $equipmentId) {
    id assignedTo { id }
  }
}`;

describe('GraphQL HTTP authentication and equipment assignment RBAC', () => {
  let directory: string;
  let db: ReturnType<typeof createDatabase>;
  let application: Awaited<ReturnType<typeof createApplication>>;
  let employeeId: string;
  let equipmentId: string;
  let originalOwnerId: string;
  const events: unknown[] = [];
  let subscriptionId: number | undefined;
  const saved = { secret: process.env.JWT_SECRET, demo: process.env.AUTH_DEMO_MODE };

  function token(role: 'ADMIN' | 'EMPLOYEE', options: jwt.SignOptions = {}) {
    return jwt.sign({ id: `test-${role}`, email: `${role.toLowerCase()}@example.com`, role }, secret, {
      jwtid: `session-${role}`, expiresIn: '1h', ...options,
    });
  }
  function assign(authorization?: string, targetEmployeeId = employeeId, targetEquipmentId = equipmentId) {
    const operation = request(application.app).post('/graphql').send({
      query: mutation, variables: { employeeId: targetEmployeeId, equipmentId: targetEquipmentId },
    });
    return authorization === undefined ? operation : operation.set('Authorization', authorization);
  }
  async function unchanged() {
    expect((await db.equipment.findUniqueOrThrow({ where: { id: equipmentId } })).assignedToId).toBe(originalOwnerId);
    expect(events).toHaveLength(0);
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    process.env.AUTH_DEMO_MODE = 'false';
    directory = await mkdtemp(join(tmpdir(), 'directory-rbac-'));
    db = createDatabase('file:' + join(directory, 'test.db').replaceAll('\\', '/'));
    // Apply the committed schema to an isolated database; never reset the developer database.
    const migrations = (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort();
    for (const migration of migrations) {
      const sql = await readFile(join('prisma/migrations', migration, 'migration.sql'), 'utf8');
      for (const statement of sql.split(';').filter(part => part.trim())) await db.$executeRawUnsafe(statement);
    }
    const seeded = await seedDatabase(db);
    for (const role of ['ADMIN', 'EMPLOYEE'] as const) {
      await db.user.create({ data: { id: `test-${role}`, name: role, email: `${role.toLowerCase()}@example.com`, role, passwordHash: 'unused-test-hash' } });
      await db.session.create({ data: { id: `session-${role}`, userId: `test-${role}`, expiresAt: new Date(Date.now() + 3600000) } });
    }
    originalOwnerId = seeded.employees[0]!.id;
    employeeId = seeded.employees[1]!.id;
    equipmentId = (await db.equipment.findUniqueOrThrow({ where: { serialNumber: 'SN-001' } })).id;
    application = await createApplication(db);
    subscriptionId = await pubsub.subscribe('EQUIPMENT_ASSIGNED', payload => { events.push(payload); });
  });

  beforeEach(async () => {
    await db.equipment.update({ where: { id: equipmentId }, data: { assignedToId: originalOwnerId } });
    events.length = 0;
  });

  afterAll(async () => {
    try {
      if (subscriptionId !== undefined) pubsub.unsubscribe(subscriptionId);
      await application?.server.stop();
    } finally {
      try { await db?.$disconnect(); }
      finally {
        if (directory) await rm(directory, { recursive: true, force: true });
        if (saved.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved.secret;
        if (saved.demo === undefined) delete process.env.AUTH_DEMO_MODE; else process.env.AUTH_DEMO_MODE = saved.demo;
      }
    }
  });

  it.each(['/', '/graphql'])('serves the browser Sandbox at %s without a request body', async path => {
    const response = await request(application.app).get(path).set('Accept', 'text/html');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).not.toContain('`req.body` is not set');
  });

  it('rejects anonymous assignment with UNAUTHENTICATED and no write or event', async () => {
    const response = await assign();
    expect(response.status).toBe(200);
    expect(response.body.errors?.[0]?.extensions.code).toBe('UNAUTHENTICATED');
    await unchanged();
  });

  it('rejects EMPLOYEE assignment with FORBIDDEN and no write or event', async () => {
    const response = await assign('Bearer ' + token('EMPLOYEE'));
    expect(response.status).toBe(200);
    expect(response.body.errors?.[0]?.extensions.code).toBe('FORBIDDEN');
    expect(response.body.errors?.[0]?.message).toBe('Administrator access is required.');
    await unchanged();
  });

  it.each([
    ['malformed token', () => 'invalid-token'],
    ['expired token', () => token('ADMIN', { expiresIn: -1 })],
    ['wrong signature', () => jwt.sign({ id: 'e', email: 'e@example.com', role: 'ADMIN' }, 'wrong-secret')],
    ['missing email', () => jwt.sign({ id: 'e', role: 'ADMIN' }, secret)],
    ['invalid role', () => jwt.sign({ id: 'e', email: 'e@example.com', role: 'OWNER' }, secret)],
  ])('rejects %s with UNAUTHENTICATED and no write or event', async (_, makeToken) => {
    const response = await assign('Bearer ' + makeToken());
    expect(response.status).toBe(401);
    expect(response.body.errors?.[0]?.extensions.code).toBe('UNAUTHENTICATED');
    await unchanged();
  });

  it('allows ADMIN assignment, persists the owner, and publishes the committed equipment', async () => {
    const response = await assign('Bearer ' + token('ADMIN'));
    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.assignEquipment).toEqual({ id: equipmentId, assignedTo: { id: employeeId } });
    const equipment = await db.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
    expect(equipment.assignedToId).toBe(employeeId);
    expect(events).toEqual([{ equipmentAssigned: equipment }]);
  });

  it.each(['employee', 'equipment'])('returns NOT_FOUND for a missing %s without publishing', async entity => {
    const response = await assign('Bearer ' + token('ADMIN'),
      entity === 'employee' ? 'missing' : employeeId,
      entity === 'equipment' ? 'missing' : equipmentId);
    expect(response.status).toBe(200);
    expect(response.body.errors?.[0]?.extensions.code).toBe('NOT_FOUND');
    await unchanged();
  });
});
