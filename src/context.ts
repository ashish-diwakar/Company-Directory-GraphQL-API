import DataLoader from 'dataloader';
import { db as sharedDb } from './db.js';
import type { PrismaClient, Employee, Equipment, Team } from './generated/prisma/client.js';
import { notFound } from './errors.js';
export function createContext(db: PrismaClient = sharedDb) {
  return {
    db,
    loaders: {
      team: new DataLoader<string, Team>(async (ids: readonly string[]) => {
        const rows = await db.team.findMany({ where: { id: { in: [...ids] } } });
        const byId = new Map(rows.map(row => [row.id, row]));
        return ids.map(id => byId.get(id) ?? notFound('Team', id));
      }),
      employee: new DataLoader(async (ids: readonly string[]) => {
        const rows = await db.employee.findMany({ where: { id: { in: [...ids] } } });
        const byId = new Map(rows.map(row => [row.id, row]));
        return ids.map(id => byId.get(id) ?? null);
      }),
      equipment: new DataLoader(async (ids: readonly string[]) => {
        const rows = await db.equipment.findMany({ where: { assignedToId: { in: [...ids] } }, orderBy: { id: 'asc' } });
        const groups = new Map<string, Equipment[]>();
        for (const row of rows) {
          const key = row.assignedToId!;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(row);
        }
        return ids.map(id => groups.get(id) ?? []);
      }),
      members: new DataLoader(async (ids: readonly string[]) => {
        const rows = await db.employee.findMany({ where: { teamId: { in: [...ids] } }, orderBy: { id: 'asc' } });
        const groups = new Map<string, Employee[]>();
        for (const row of rows) {
          if (!groups.has(row.teamId)) groups.set(row.teamId, []);
          groups.get(row.teamId)!.push(row);
        }
        return ids.map(id => groups.get(id) ?? []);
      }),
    },
  };
}
export type Context = ReturnType<typeof createContext>;

