/**
 * BullMQ Queue Constants
 *
 * 📚 QUEUE NAMES FOR ALL BULLMQ QUEUES
 *
 * Compatible with Express.js bullmq.ts
 */

export const BULLMQ_NOTIFICATION_QUEUE = 'BULLMQ_NOTIFICATION_QUEUE';
export const BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE = 'BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE';
export const BULLMQ_TASK_REMINDERS_QUEUE = 'BULLMQ_TASK_REMINDERS_QUEUE';
export const BULLMQ_NOTIFY_PARTICIPANTS_QUEUE = 'BULLMQ_NOTIFY_PARTICIPANTS_QUEUE';
export const BULLMQ_PREFERRED_TIME_QUEUE = 'BULLMQ_PREFERRED_TIME_QUEUE';

export const QUEUE_NAMES = {
  NOTIFICATION: 'notificationQueue-e-learning',
  CONVERSATION_LAST_MESSAGE: 'updateConversationsLastMessageQueue-suplify',
  TASK_REMINDERS: 'task-reminders-queue',
  NOTIFY_PARTICIPANTS: 'notify-participants-queue-suplify',
  PREFERRED_TIME: 'preferredTimeQueue',
} as const;
