import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';

import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { Notification, NotificationSchema } from './notification.schema';
import { TaskReminderModule } from './taskReminder/taskReminder.module';

import { RedisModule } from '../../helpers/redis/redis.module';
import { SocketModule } from '../socket.gateway/socket.module';
import { BULLMQ_NOTIFICATION_QUEUE, QUEUE_NAMES } from '../../helpers/bullmq/bullmq.constants';
import { setNotificationService } from '../../helpers/notification.helper';

/**
 * Notification Module
 *
 * 📬 GENERIC NOTIFICATION SYSTEM
 *
 * Features:
 * - Generic notifications (not coupled to any specific module)
 * - Real-time Socket.IO delivery
 * - Async BullMQ processing
 * - Redis caching for unread counts
 * - Broadcast to users/roles
 * - Global helper for use from anywhere
 *
 * Usage from other modules:
 * ```typescript
 * // Method 1: Inject NotificationService
 * constructor(private notificationService: NotificationService) {}
 *
 * await this.notificationService.sendNotification({
 *   title: 'New Task Assigned',
 *   senderId: userId,
 *   receiverId: assigneeId,
 *   type: NotificationType.ASSIGNMENT,
 *   entityType: 'task',
 *   entityId: taskId,
 * });
 *
 * // Method 2: Use global helper (from anywhere)
 * import { enqueueNotification } from '../../helpers/notification.helper';
 *
 * await enqueueNotification({
 *   title: 'New Blog Published',
 *   senderId: userId,
 *   receiverId: followerId,
 *   type: NotificationType.CUSTOM,
 *   entityType: 'blog',
 *   entityId: blogId,
 * });
 * ```
 *
 * Compatible with Express.js notification.module.js
 */
@Module({
  imports: [
    // MongoDB - Notification collection
    MongooseModule.forFeature([{
      name: Notification.name,
      schema: NotificationSchema,
    }]),

    // Redis Module (for caching)
    RedisModule,

    // Socket Module (for real-time notifications)
    SocketModule,

    // BullMQ Module (for async processing)
    BullModule.registerQueue({
      name: QUEUE_NAMES.NOTIFICATION,
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    }),

    // Task Reminder Module
    TaskReminderModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,

    // BullMQ Queue Provider
    {
      provide: BULLMQ_NOTIFICATION_QUEUE,
      useFactory: () => {
        return BullModule.getQueue(QUEUE_NAMES.NOTIFICATION);
      },
    },
  ],
  exports: [NotificationService, TaskReminderModule],
})
export class NotificationModule implements OnModuleInit {
  constructor(private notificationService: NotificationService) {}

  /**
   * Initialize notification helper on module init
   *
   * This sets the notification service instance so the helper
   * functions can be used from anywhere in the app
   */
  onModuleInit() {
    setNotificationService(this.notificationService);
    console.log('✅ Notification Module initialized - Global helper ready to use');
    console.log('📬 You can now use: import { enqueueNotification } from "./helpers/notification.helper"');
  }
}
