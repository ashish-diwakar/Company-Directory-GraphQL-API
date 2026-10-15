import DataLoader from 'dataloader';
import { db as sharedDb } from './db.js';
import type { PrismaClient, Employee, Equipment, Team } from './generated/prisma/client.js';
import { notFound } from './errors.js';
import type { AuthUser } from './auth.js';
import { pubsub } from './pubsub.js';

export interface GraphQLContext {
  db: PrismaClient;
  user?: AuthUser | null;
  pubsub: typeof pubsub;
  loaders: {
    team: DataLoader<string, Team>;
    employee: DataLoader<string, Employee | null>;
    equipment: DataLoader<string, Equipment[]>;
    members: DataLoader<string, Employee[]>;
  };
}

export function createContext(db: PrismaClient = sharedDb, user: AuthUser | null = null): GraphQLContext {
  return {
    db,
    user,
    pubsub,
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
export type Context = GraphQLContext;

