import type { Resolvers } from '../__generated__/resolvers-types.js';
import { queries } from './queries.js';
import { mutations } from './mutations.js';
import { subscriptions } from './subscriptions.js';
import { employeeFields, equipmentFields, teamFields, userFields } from './fields.js';

export const resolvers: Resolvers = {
  Query: queries,
  Mutation: mutations,
  Subscription: subscriptions,
  Employee: employeeFields,
  Team: teamFields,
  Equipment: equipmentFields,
  User: userFields,
  AssignmentEvent: { createdAt: event => event.createdAt.toISOString() },
  Invitation: {
    createdAt: invitation => invitation.createdAt.toISOString(),
    expiresAt: invitation => invitation.expiresAt.toISOString(),
    acceptedAt: invitation => invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: invitation => invitation.revokedAt?.toISOString() ?? null,
  },
};
