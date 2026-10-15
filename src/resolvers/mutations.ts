import type { MutationResolvers } from '../__generated__/resolvers-types.js';
import { badInput, databaseError, notFound } from '../errors.js';
import { requireAdmin } from '../auth.js';
import { register, signIn, signOut, changePassword, sessionUser, validateName, throttleAuthentication, sessionEvents } from '../accounts.js';
import { equipmentInput } from '../inventory.js';
import { changeAssignment } from '../equipment-lifecycle.js';
export const mutations: MutationResolvers = {
  returnEquipment: async (_, { equipmentId, expectedEmployeeId, notes }, { db, user, loaders, pubsub }) => {
    requireAdmin(user);
    try {
      const result = await changeAssignment(db, user, equipmentId, null, expectedEmployeeId, notes);
      if (result.previous.assignedToId) loaders.equipment.clear(result.previous.assignedToId);
      if (result.changed) {
        await pubsub.publish('EQUIPMENT_RETURNED', { equipmentReturned: result.equipment });
        await pubsub.publish('MY_EQUIPMENT_CHANGED', { employeeIds: result.previous.assignedToId ? [result.previous.assignedToId] : [] });
      }
      return result.equipment;
    } catch (error) { databaseError(error); }
  },
  linkAccountToEmployee: async (_, { userId, employeeId }, { db, user }) => {
    requireAdmin(user);
    try {
      const result = await db.$transaction(async tx => {
        if (!await tx.user.findUnique({ where: { id: userId } })) throw notFound('Account', userId);
        if (employeeId && !await tx.employee.findUnique({ where: { id: employeeId } })) throw notFound('Employee', employeeId);
        const account = await tx.user.update({ where: { id: userId }, data: { employeeId: employeeId ?? null } });
        const sessions = await tx.session.findMany({ where: { userId } });
        return { account, sessions };
      });
      // Close existing streams so they cannot keep the former employee identity.
      sessionEvents.emit('revoked', result.sessions.map(session => session.id));
      return result.account;
    } catch (error) { databaseError(error, 'This employee is already linked to another account.'); }
  },
  createEquipment: async (_, { input }, { db, user }) => {
    requireAdmin(user);
    const data = equipmentInput(input);
    try { return await db.equipment.create({ data }); }
    catch (error) { databaseError(error, 'An equipment item with this serial number already exists.'); }
  },
  updateEquipment: async (_, { id, input }, { db, user, loaders, pubsub }) => {
    requireAdmin(user);
    const data = equipmentInput(input);
    try {
      const equipment = await db.equipment.update({ where: { id }, data });
      if (equipment.assignedToId) loaders.equipment.clear(equipment.assignedToId);
      if (equipment.assignedToId) await pubsub.publish('MY_EQUIPMENT_CHANGED', { employeeIds: [equipment.assignedToId] });
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
      const { previous, equipment, changed } = await changeAssignment(db, user, equipmentId, employeeId);
      if (previous.assignedToId) loaders.equipment.clear(previous.assignedToId);
      loaders.equipment.clear(employeeId);
      if (changed) {
        await pubsub.publish('EQUIPMENT_ASSIGNED', { equipmentAssigned: equipment });
        await pubsub.publish('MY_EQUIPMENT_CHANGED', { employeeIds: [...new Set([previous.assignedToId, employeeId].filter((id): id is string => id !== null))] });
      }
      return equipment;
    } catch (error) { databaseError(error); }
  },
};

