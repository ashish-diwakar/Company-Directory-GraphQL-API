import { GraphQLError } from 'graphql';
import type { PrismaClient } from './generated/prisma/client.js';
import type { AuthUser } from './auth.js';
import { requireAdmin, requireUser } from './auth.js';
import { badInput, notFound } from './errors.js';

export async function changeAssignment(db: PrismaClient, identity: AuthUser | null | undefined, equipmentId: string,
  targetEmployeeId: string | null, expectedEmployeeId?: string, notes?: string | null) {
  const actor = requireUser(identity);
  requireAdmin(actor);
  const comment = notes?.trim() || null;
  if (comment && (comment.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(comment))) throw badInput('Return notes must be at most 500 characters and cannot contain control characters.');
  return db.$transaction(async tx => {
    const target = targetEmployeeId ? await tx.employee.findUnique({ where: { id: targetEmployeeId } }) : null;
    if (targetEmployeeId && !target) throw notFound('Employee', targetEmployeeId);
    const previous = await tx.equipment.findUnique({ where: { id: equipmentId } });
    if (!previous) throw notFound('Equipment', equipmentId);
    // Repeated identical actions are idempotent and never create duplicate history entries.
    if (previous.assignedToId === targetEmployeeId) return { previous, equipment: previous, changed: false };
    if (expectedEmployeeId !== undefined && previous.assignedToId !== expectedEmployeeId) {
      throw new GraphQLError('This device has been reassigned. Refresh inventory before returning it.', { extensions: { code: 'CONFLICT' } });
    }
    const oldOwner = previous.assignedToId ? await tx.employee.findUnique({ where: { id: previous.assignedToId } }) : null;
    const account = await tx.user.findUnique({ where: { id: actor.id } });
    const changed = await tx.equipment.updateMany({ where: { id: equipmentId, assignedToId: previous.assignedToId }, data: { assignedToId: targetEmployeeId } });
    if (changed.count !== 1) throw new GraphQLError('The assignment changed. Refresh and try again.', { extensions: { code: 'CONFLICT' } });
    const equipment = await tx.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
    await tx.assignmentEvent.create({ data: {
      equipmentId, equipmentModel: previous.model, serialNumber: previous.serialNumber,
      action: targetEmployeeId === null ? 'RETURNED' : previous.assignedToId === null ? 'ASSIGNED' : 'REASSIGNED',
      actorId: actor.id, actorName: account?.name ?? actor.email, actorEmail: actor.email,
      fromEmployeeId: previous.assignedToId, fromEmployeeName: oldOwner?.name ?? null,
      toEmployeeId: targetEmployeeId, toEmployeeName: target?.name ?? null, notes: comment,
    } });
    return { previous, equipment, changed: true };
  });
}
