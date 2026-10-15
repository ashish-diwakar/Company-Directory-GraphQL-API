import type { Resolvers } from '../__generated__/resolvers-types.js';
import { queries } from './queries.js';
import { mutations } from './mutations.js';
import { subscriptions } from './subscriptions.js';
import { employeeFields, equipmentFields, teamFields } from './fields.js';

export const resolvers: Resolvers = {
  Query: queries,
  Mutation: mutations,
  Subscription: subscriptions,
  Employee: employeeFields,
  Team: teamFields,
  Equipment: equipmentFields,
};
