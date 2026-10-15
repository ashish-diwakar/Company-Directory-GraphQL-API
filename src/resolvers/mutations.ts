import type { MutationResolvers } from '../__generated__/resolvers-types.js';
import { badInput, databaseError, notFound } from '../errors.js';
import { requireAdmin } from '../auth.js';
import { register, signIn, signOut, changePassword, sessionUser, validateName, throttleAuthentication } from '../accounts.js';
import { equipmentInput } from '../inventory.js';
export const mutations: MutationResolvers = {
  createEquipment: async (_, { input }, { db, user }) => {
    requireAdmin(user);
    const data = equipmentInput(input);
    try { return await db.equipment.create({ data }); }
    catch (error) { databaseError(error, 'An equipment item with this serial number already exists.'); }
  },
  updateEquipment: async (_, { id, input }, { db, user, loaders }) => {
    requireAdmin(user);
    const data = equipmentInput(input);
    try {
      const equipment = await db.equipment.update({ where: { id }, data });
      if (equipment.assignedToId) loaders.equipment.clear(equipment.assignedToId);
      return equipment;
    } catch (error) { databaseError(error, 'An equipment item with this serial number already exists.'); }
  },
  register: (_, { input }, { db, clientAddress }) => { throttleAuthentication(clientAddress); return register(db, input); },
  signIn: (_, { email, password }, { db, clientAddress }) => { throttleAuthentication(clientAddress); return signIn(db, email, password); },
  signOut: (_, __, { db, user }) => signOut(db, user),
  updateProfile: async (_, { name }, { db, user }) => {
    const account = await sessionUser(db, user);
    return db.user.update({ where: { id: account.id }, data: { name: validateName(name) } });
  },
  changePassword: (_, { currentPassword, newPassword }, { db, user }) => changePassword(db, user, currentPassword, newPassword),
  createEmployee: async (_, { input }, { db, loaders, user }) => {
    requireAdmin(user);
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
  assignEquipment: async (_, { employeeId, equipmentId }, { db, loaders, user, pubsub }) => {
    requireAdmin(user);
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
      await pubsub.publish('EQUIPMENT_ASSIGNED', { equipmentAssigned: equipment });
      return equipment;
    } catch (error) { databaseError(error); }
  },
};

