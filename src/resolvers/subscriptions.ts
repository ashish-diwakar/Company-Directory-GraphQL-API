import type { SubscriptionResolvers } from '../__generated__/resolvers-types.js';
import { requireUser } from '../auth.js';
import { sessionUser } from '../accounts.js';
import type { Equipment } from '../generated/prisma/client.js';
import type { Context } from '../context.js';
import { filteredEvents } from '../filtered-events.js';

export const subscriptions: SubscriptionResolvers = {
  equipmentReturned: {
    subscribe: (_, __, { user, db, pubsub }) => {
      requireUser(user);
      const events = pubsub.asyncIterableIterator<{ equipmentReturned: Equipment }>(['EQUIPMENT_RETURNED']);
      return filteredEvents(events, async () => (await sessionUser(db, user)).role === 'ADMIN');
    },
    resolve: (payload: { equipmentReturned: Equipment }, _: unknown, { loaders }: Context) => {
      for (const loader of Object.values(loaders)) loader.clearAll();
      return payload.equipmentReturned;
    },
  },
  equipmentAssigned: {
    subscribe: (_, __, { user, db, pubsub }) => {
      requireUser(user);
      const events = pubsub.asyncIterableIterator<{ equipmentAssigned: Equipment }>(['EQUIPMENT_ASSIGNED']);
      // Read current account/session on each event; never trust a long-lived role/link snapshot.
      return filteredEvents(events, async event => {
        const account = await sessionUser(db, user);
        return account.role === 'ADMIN' || Boolean(account.employeeId && account.employeeId === event.equipmentAssigned.assignedToId);
      });
    },
    resolve: (payload: { equipmentAssigned: Equipment }, _: unknown, { loaders }: Context) => {
      for (const loader of Object.values(loaders)) loader.clearAll();
      return payload.equipmentAssigned;
    },
  },
  myEquipmentChanged: {
    subscribe: (_, __, { user, db, pubsub }) => {
      requireUser(user);
      const events = pubsub.asyncIterableIterator<{ employeeIds: string[] }>(['MY_EQUIPMENT_CHANGED']);
      return filteredEvents(events, async event => {
        const account = await sessionUser(db, user);
        return Boolean(account.employeeId && event.employeeIds.includes(account.employeeId));
      });
    },
    resolve: () => true,
  },
};
