import type { PrismaClient } from '../src/generated/prisma/client.js';
import { pathToFileURL } from 'node:url';
import { db } from '../src/db.js';

// One transaction ensures a failed seed never leaves a half-reset database.
export async function seedDatabase(client: PrismaClient) {
  return client.$transaction(async tx => {
    await tx.equipment.deleteMany();
    await tx.employee.deleteMany();
    await tx.team.deleteMany();
    const platform = await tx.team.create({ data: { name: 'Platform', department: 'Engineering' } });
    const experience = await tx.team.create({ data: { name: 'Experience', department: 'Design' } });
    const employees = [];
    for (const data of [
      { name: 'Asha Patel', email: 'asha@example.com', role: 'Engineer', teamId: platform.id },
      { name: 'Liam Chen', email: 'liam@example.com', role: 'Engineer', teamId: platform.id },
      { name: 'Maya Singh', email: 'maya@example.com', role: 'Designer', teamId: experience.id },
      { name: 'Noah Reed', email: 'noah@example.com', role: 'Manager', teamId: experience.id },
    ]) employees.push(await tx.employee.create({ data }));
    await tx.equipment.createMany({ data: [
      { type: 'Laptop', model: 'ThinkPad T14', serialNumber: 'SN-001', assignedToId: employees[0]!.id },
      { type: 'Laptop', model: 'MacBook Pro', serialNumber: 'SN-002', assignedToId: employees[2]!.id },
      { type: 'Monitor', model: 'Dell U2723QE', serialNumber: 'SN-003', assignedToId: employees[0]!.id },
      { type: 'Phone', model: 'Pixel 9', serialNumber: 'SN-004', assignedToId: employees[3]!.id },
    ] });
    return { teams: [platform, experience], employees };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await seedDatabase(db);
    console.log('Seeded 2 teams, 4 employees, and 4 equipment items.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally { await db.$disconnect(); }
}

