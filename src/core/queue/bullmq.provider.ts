import { BullModule } from '@nestjs/bullmq';
import { redisPubClient } from '../redis/redis.provider';

import { QUEUE_NAMES } from './bullmq.constants';

/**
 * BullMQ Provider
 *
 * 📚 BULLMQ QUEUE CONFIGURATION
 *
 * Registers all BullMQ queues with Redis connection
 * Compatible with Express.js bullmq.ts
 *
 * Queues:
 * 1. Notification Queue - For async notification processing
 * 2. Conversation Last Message Queue - For updating conversation last messages
 * 3. Task Reminders Queue - For sending task reminders
 * 4. Notify Participants Queue - For notifying chat participants
 * 5. Preferred Time Queue - For calculating user preferred times
 */
export const BullMQProvider = BullModule.registerQueue({
  name: QUEUE_NAMES.NOTIFICATION,
  connection: redisPubClient.options,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

/**
 * BullMQ Module
 *
 * Imports and exports all BullMQ queues
 */
export const BullMQModule = BullModule.registerQueue(
  {
    name: QUEUE_NAMES.NOTIFICATION,
    connection: redisPubClient.options,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  },
  {
    name: QUEUE_NAMES.CONVERSATION_LAST_MESSAGE,
    connection: redisPubClient.options,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  },
  {
    name: QUEUE_NAMES.TASK_REMINDERS,
    connection: redisPubClient.options,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  },
  {
    name: QUEUE_NAMES.NOTIFY_PARTICIPANTS,
    connection: redisPubClient.options,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  },
  {
    name: QUEUE_NAMES.PREFERRED_TIME,
    connection: redisPubClient.options,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  },
);
