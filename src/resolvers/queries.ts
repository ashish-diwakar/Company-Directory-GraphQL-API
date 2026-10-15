import type { QueryResolvers } from '../__generated__/resolvers-types.js';
import { notFound, badInput } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { requireUser, requireAdmin } from '../auth.js';
import { sessionUser } from '../accounts.js';
export const queries: QueryResolvers = {
  equipmentHistory: async (_, { equipmentId, offset, limit }, { db, user }) => {
    requireAdmin(user);
    const start = offset ?? 0;
    const size = limit ?? 20;
    if (start < 0 || size < 1 || size > 100) throw badInput('Offset must be nonnegative and limit must be between 1 and 100.');
    const where = equipmentId ? { equipmentId } : {};
    const [total, items] = await db.$transaction([
      db.assignmentEvent.count({ where }),
      db.assignmentEvent.findMany({ where, skip: start, take: size, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    ]);
    return { total, items };
  },
  myEquipment: async (_, __, { db, user, loaders }) => {
    const account = await sessionUser(db, user);
    return account.employeeId ? loaders.equipment.load(account.employeeId) : [];
  },
  equipmentInventory: async (_, { search, assigned, offset = 0, limit = 20 }, { db, user }) => {
    requireAdmin(user);
    const start = offset ?? 0;
    const size = limit ?? 20;
    if (start < 0 || size < 1 || size > 100) throw badInput('Offset must be nonnegative and limit must be between 1 and 100.');
    const term = search?.trim() ?? '';
    if (term.length > 100) throw badInput('Search must contain at most 100 characters.');
    const where: Prisma.EquipmentWhereInput = {
      ...(assigned == null ? {} : { assignedToId: assigned ? { not: null } : null }),
      ...(term ? { OR: [{ type: { contains: term } }, { model: { contains: term } }, { serialNumber: { contains: term } }] } : {}),
    };
    const [total, items] = await db.$transaction([
      db.equipment.count({ where }),
      db.equipment.findMany({ where, skip: start, take: size, orderBy: [{ model: 'asc' }, { id: 'asc' }] }),
    ]);
    return { items, total };
  },
  me: (_, __, { db, user }) => user ? sessionUser(db, user) : null,
  users: (_, __, { db, user }) => { requireAdmin(user); return db.user.findMany({ orderBy: { createdAt: 'asc' } }); },
  employees: (_, { role }, { db, user }) => { requireUser(user); return db.employee.findMany({ where: role == null ? {} : { role }, orderBy: { id: 'asc' } }); },
  employee: async (_, { id }, { db, user }) => {
    requireUser(user);
    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee) throw notFound('Employee', id);
    return employee;
  },
  teams: (_, __, { db, user }) => { requireUser(user); return db.team.findMany({ orderBy: { id: 'asc' } }); },
};

