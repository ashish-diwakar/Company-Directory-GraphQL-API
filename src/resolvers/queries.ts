import type { QueryResolvers } from '../__generated__/resolvers-types.js';
import { notFound } from '../errors.js';
export const queries: QueryResolvers = {
  employees: (_, { role }, { db }) => db.employee.findMany({ where: role == null ? {} : { role }, orderBy: { id: 'asc' } }),
  employee: async (_, { id }, { db }) => {
    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee) throw notFound('Employee', id);
    return employee;
  },
  teams: (_, __, { db }) => db.team.findMany({ orderBy: { id: 'asc' } }),
};

