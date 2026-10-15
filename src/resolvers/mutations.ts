import type { MutationResolvers } from '../__generated__/resolvers-types.js';
import { badInput, databaseError, notFound } from '../errors.js';
export const mutations: MutationResolvers = {
  createEmployee: async (_, { input }, { db, loaders }) => {
    const name = input.name.trim();
    const role = input.role.trim();
    const email = input.email.trim().toLowerCase();
    if (!name || !role) throw badInput('Name and role must not be blank.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badInput('A valid email address is required.');
    try {
      const employee = await db.$transaction(async tx => {
        if (!await tx.team.findUnique({ where: { id: input.teamId } })) throw notFound('Team', input.teamId);
        return tx.employee.create({ data: { name, role, email, teamId: input.teamId } });
      });
      loaders.members.clear(employee.teamId);
      loaders.employee.clear(employee.id).prime(employee.id, employee);
      return employee;
    } catch (error) { databaseError(error); }
  },
  assignEquipment: async (_, { employeeId, equipmentId }, { db, loaders }) => {
    try {
      const { previous, equipment } = await db.$transaction(async tx => {
        if (!await tx.employee.findUnique({ where: { id: employeeId } })) throw notFound('Employee', employeeId);
        const previous = await tx.equipment.findUnique({ where: { id: equipmentId } });
        if (!previous) throw notFound('Equipment', equipmentId);
        const equipment = await tx.equipment.update({ where: { id: equipmentId }, data: { assignedToId: employeeId } });
        return { previous, equipment };
      });
      if (previous.assignedToId) loaders.equipment.clear(previous.assignedToId);
      loaders.equipment.clear(employeeId);
      return equipment;
    } catch (error) { databaseError(error); }
  },
};

