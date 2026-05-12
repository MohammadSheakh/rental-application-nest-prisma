import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';

import { ConversationController } from './conversation/conversation.controller';
import { ConversationService } from './conversation/conversation.service';
import { Conversation, ConversationSchema } from './conversation/conversation.schema';

import { ConversationParticipents, ConversationParticipentsSchema } from './conversationParticipents/conversationParticipents.schema';

import { MessageController } from './message/message.controller';
import { MessageService } from './message/message.service';
import { Message, MessageSchema } from './message/message.schema';

import { MessageReadStatusService } from './messageReadStatus/messageReadStatus.service';
import { MessageReadStatus, MessageReadStatusSchema } from './messageReadStatus/messageReadStatus.schema';

import { SocketModule } from '../../socket.gateway/socket.module';
import { RedisModule } from '../../../helpers/redis/redis.module';
import {
  BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE,
  BULLMQ_NOTIFY_PARTICIPANTS_QUEUE,
  QUEUE_NAMES,
} from '../../../helpers/bullmq/bullmq.constants';

/**
 * Chatting Module
 *
 * 📚 CHAT MESSAGING MODULE
 *
 * Features:
 * - Real-time messaging
 * - Direct & Group conversations
 * - Participant management
 * - Unread message tracking
 * - Read receipts
 * - Socket.IO integration
 * - Redis state management
 * - BullMQ async processing
 *
 * Sub-modules:
 * - Conversation (parent)
 * - ConversationParticipents
 * - Message
 * - MessageReadStatus
 *
 * Compatible with Express.js chatting.module/
 */
@Module({
  imports: [
    // MongoDB Collections
    MongooseModule.forFeature([
      {
        name: Conversation.name,
        schema: ConversationSchema,
      },
      {
        name: ConversationParticipents.name,
        schema: ConversationParticipentsSchema,
      },
      {
        name: Message.name,
        schema: MessageSchema,
      },
      {
        name: MessageReadStatus.name,
        schema: MessageReadStatusSchema,
      },
    ]),

    // Redis Module (for state management)
    RedisModule,

    // Socket Module (for real-time updates)
    SocketModule,

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
    MongooseModule.forFeature([
      {
        name: Conversation.name,
        schema: ConversationSchema,
      },
      {
        name: ConversationParticipents.name,
        schema: ConversationParticipentsSchema,
      },
      {
        name: Message.name,
        schema: MessageSchema,
      },
      {
        name: MessageReadStatus.name,
        schema: MessageReadStatusSchema,
      },
    ]),
  ],
})
export class ChattingModule {}
