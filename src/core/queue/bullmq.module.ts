import { Module, Global } from '@nestjs/common';
import { BullMQModule } from './bullmq.provider';

import {
  BULLMQ_NOTIFICATION_QUEUE,
  BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE,
  BULLMQ_TASK_REMINDERS_QUEUE,
  BULLMQ_NOTIFY_PARTICIPANTS_QUEUE,
  BULLMQ_PREFERRED_TIME_QUEUE,
  QUEUE_NAMES,
} from './bullmq.constants';

/**
 * BullMQ Module
 *
 * 📚 GLOBAL BULLMQ MODULE FOR ASYNC JOB PROCESSING
 *
 * Features:
 * - 5 queues for different job types
 * - Redis connection from shared provider
 * - Automatic retry with exponential backoff
 * - Job logging and error handling
 *
 * Queues:
 * 1. Notification Queue - Async notification processing
 * 2. Conversation Last Message Queue - Update conversation metadata
 * 3. Task Reminders Queue - Send scheduled task reminders
 * 4. Notify Participants Queue - Notify chat participants
 * 5. Preferred Time Queue - Calculate user preferred times
 *
 * Compatible with Express.js bullmq.ts
 *
 * Usage:
 * ```typescript
 * constructor(
 *   @Inject(BULLMQ_NOTIFICATION_QUEUE) private notificationQueue: Queue,
 * ) {}
 *
 * async queueNotification(data: any) {
 *   await this.notificationQueue.add('send-notification', data, {
 *     jobId: `notif:${userId}:${Date.now()}`,
 *   });
 * }
 * ```
 */
@Global()
@Module({
  imports: [BullMQModule],
  exports: [BullMQModule],
})
export class BullMQModule {}
