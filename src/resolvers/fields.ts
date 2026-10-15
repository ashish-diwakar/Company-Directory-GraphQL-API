import type { EmployeeResolvers, EquipmentResolvers, TeamResolvers } from '../__generated__/resolvers-types.js';
export const employeeFields: EmployeeResolvers = {
  team: (employee, _, { loaders }) => loaders.team.load(employee.teamId),
  assignedEquipment: (employee, _, { loaders }) => loaders.equipment.load(employee.id),
};
export const teamFields: TeamResolvers = {
  members: (team, _, { loaders }) => loaders.members.load(team.id),
};
export const equipmentFields: EquipmentResolvers = {
  assignedTo: (equipment, _, { loaders }) => equipment.assignedToId === null ? null : loaders.employee.load(equipment.assignedToId),
};

