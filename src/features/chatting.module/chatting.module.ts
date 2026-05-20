import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@app/database';

import { ConversationController } from './conversation/conversation.controller';
import { ConversationService } from './conversation/conversation.service';

import { MessageController } from './message/message.controller';
import { MessageService } from './message/message.service';

import { MessageReadStatusService } from './messageReadStatus/messageReadStatus.service';

import { SocketModule } from '../socket.gateway/socket.module';
import { RedisModule } from '@app/redis';
import {
  BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE,
  BULLMQ_NOTIFY_PARTICIPANTS_QUEUE,
  QUEUE_NAMES,
} from '@app/queue';

/**
 * Chatting Module
 *
 * 📚 CHAT MESSAGING MODULE
 */
@Module({
  imports: [
    // Database Module
    PrismaModule,

    // Redis Module (for state management)
    RedisModule,

    // Socket Module (for real-time updates)
    forwardRef(() => SocketModule),

    // BullMQ Queues
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.CONVERSATION_LAST_MESSAGE,
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
      },
      {
        name: QUEUE_NAMES.NOTIFY_PARTICIPANTS,
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
      },
    ),
  ],
  controllers: [
    ConversationController,
    MessageController,
  ],
  providers: [
    ConversationService,
    MessageService,
    MessageReadStatusService,

    // BullMQ Queue Providers
    {
      provide: BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE,
      useFactory: () => {
        return BullModule.getQueue(QUEUE_NAMES.CONVERSATION_LAST_MESSAGE);
      },
    },
    {
      provide: BULLMQ_NOTIFY_PARTICIPANTS_QUEUE,
      useFactory: () => {
        return BullModule.getQueue(QUEUE_NAMES.NOTIFY_PARTICIPANTS);
      },
    },
  ],
  exports: [
    ConversationService,
    MessageService,
    MessageReadStatusService,
  ],
})
export class ChattingModule {}
