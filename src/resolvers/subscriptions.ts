import type { SubscriptionResolvers } from '../__generated__/resolvers-types.js';
import { requireUser } from '../auth.js';
import type { Equipment } from '../generated/prisma/client.js';
import type { Context } from '../context.js';

export const subscriptions: SubscriptionResolvers = {
  equipmentAssigned: {
    subscribe: (_, __, { user, pubsub }) => {
      requireUser(user);
      return pubsub.asyncIterableIterator<{ equipmentAssigned: Equipment }>(['EQUIPMENT_ASSIGNED']);
    },
    resolve: (payload: { equipmentAssigned: Equipment }, _: unknown, { loaders }: Context) => {
      // A subscription context lives for an operation; refresh relations on every event.
      for (const loader of Object.values(loaders)) loader.clearAll();
      return payload.equipmentAssigned;
    },
  },
};
