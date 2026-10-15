import type { PublicEmployeeInput } from './__generated__/resolvers-types.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { normalizedEmail, validateName } from './accounts.js';
import { badInput, notFound } from './errors.js';

export function employeeInput(input: PublicEmployeeInput) {
  const name = validateName(input.name);
  if (/[\x00-\x1f\x7f]/.test(name)) throw badInput('Employee name cannot contain control characters.');
  const role = input.role.trim();
  if (!role || role.length > 100 || /[\x00-\x1f\x7f]/.test(role)) throw badInput('Job title must contain between 1 and 100 characters without control characters.');
  if (!input.teamId.trim()) throw badInput('Choose a team for this employee.');
  return { name, role, email: normalizedEmail(input.email), teamId: input.teamId };
}

export async function saveEmployee(db: PrismaClient, input: PublicEmployeeInput, id?: string, accountId?: string) {
  const data = employeeInput(input);
  return db.$transaction(async tx => {
    if (!await tx.team.findUnique({ where: { id: data.teamId } })) throw notFound('Team', data.teamId);
    const previous = id !== undefined ? await tx.employee.findUnique({ where: { id } }) : null;
    if (id !== undefined && !previous) throw notFound('Employee', id);
    if (accountId !== undefined) {
      const account = await tx.user.findUnique({ where: { id: accountId } });
      if (!account) throw notFound('Account', accountId);
      if (!account.active) throw badInput('Reactivate this account before creating its employee record.');
      if (account.employeeId) throw badInput('This account already has an employee link. Edit the existing employee or change the link.');
    }
    const employee = id !== undefined ? await tx.employee.update({ where: { id }, data }) : await tx.employee.create({ data });
    if (accountId !== undefined) {
      const result = await tx.user.updateMany({ where: { id: accountId, employeeId: null }, data: { employeeId: employee.id } });
      if (result.count !== 1) throw badInput('The account link changed. Refresh Accounts and try again.');
    }
    const sessions = accountId !== undefined ? await tx.session.findMany({ where: { userId: accountId } }) : [];
    return { employee, previous, sessions };
  });
}
