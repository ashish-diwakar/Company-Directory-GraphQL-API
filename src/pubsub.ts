import { PubSub } from 'graphql-subscriptions';
import type { Equipment } from './generated/prisma/client.js';

export const pubsub = new PubSub<{
  EQUIPMENT_ASSIGNED: { equipmentAssigned: Equipment };
  EQUIPMENT_RETURNED: { equipmentReturned: Equipment };
  MY_EQUIPMENT_CHANGED: { employeeIds: string[] };
}>();
