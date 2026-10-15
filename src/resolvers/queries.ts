import type { QueryResolvers } from '../__generated__/resolvers-types.js';
import { notFound } from '../errors.js';
import { requireUser, requireAdmin } from '../auth.js';
import { sessionUser } from '../accounts.js';
export const queries: QueryResolvers = {
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

