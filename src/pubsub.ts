import { PubSub } from 'graphql-subscriptions';
import type { Equipment } from './generated/prisma/client.js';

export const pubsub = new PubSub<{ EQUIPMENT_ASSIGNED: { equipmentAssigned: Equipment } }>();
