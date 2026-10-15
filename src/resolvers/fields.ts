import type { EmployeeResolvers, EquipmentResolvers, TeamResolvers, UserResolvers } from '../__generated__/resolvers-types.js';
import { requireUser } from '../auth.js';
import { GraphQLError } from 'graphql';
export const employeeFields: EmployeeResolvers = {
  team: (employee, _, { loaders }) => loaders.team.load(employee.teamId),
  assignedEquipment: (employee, _, { loaders, user }) => {
    const viewer = requireUser(user);
    return viewer.role === 'ADMIN' || viewer.employeeId === employee.id ? loaders.equipment.load(employee.id) : [];
  },
};
export const teamFields: TeamResolvers = {
  members: (team, _, { loaders }) => loaders.members.load(team.id),
};
export const equipmentFields: EquipmentResolvers = {
  serialNumber: (equipment, _, { user }) => {
    const viewer = requireUser(user);
    if (viewer.role !== 'ADMIN' && (!viewer.employeeId || equipment.assignedToId !== viewer.employeeId)) {
      throw new GraphQLError('You cannot view this equipment.', { extensions: { code: 'FORBIDDEN' } });
    }
    return equipment.serialNumber;
  },
  assignedTo: (equipment, _, { loaders }) => equipment.assignedToId === null ? null : loaders.employee.load(equipment.assignedToId),
};
export const userFields: UserResolvers = {
  employee: (account, _, { loaders }) => account.employeeId ? loaders.employee.load(account.employeeId) : null,
};

