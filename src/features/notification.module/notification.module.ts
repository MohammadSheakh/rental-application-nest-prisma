import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';

import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { Notification, NotificationSchema } from './notification.schema';
import { TaskReminderModule } from './taskReminder/taskReminder.module';

import { RedisModule } from '@app/redis';
import { SocketModule } from '../socket.gateway/socket.module';
import { BULLMQ_NOTIFICATION_QUEUE, QUEUE_NAMES } from '../../core/queue/bullmq.constants';

/**
 * Notification Module
 *
 * 📬 GENERIC NOTIFICATION SYSTEM
 */
@Module({
  imports: [
    // MongoDB - Notification collection
    /*
    MongooseModule.forFeature([{
      name: Notification.name,
      schema: NotificationSchema,
    }]),
    */

    // Redis Module (for caching)
    RedisModule,

    // Socket Module (for real-time notifications)
    forwardRef(() => SocketModule),

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
export class NotificationModule {
  constructor(private notificationService: NotificationService) {}
}

