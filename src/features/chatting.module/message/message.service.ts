import { Injectable, Logger, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Redis } from 'ioredis';

import { Message, MessageDocument } from './message.schema';
import { Conversation, ConversationDocument } from '../conversation/conversation.schema';
import { ConversationParticipents, ConversationParticipentsDocument } from '../conversationParticipents/conversationParticipents.schema';
import { SendMessageDto } from './dto/message.dto';
import { REDIS_CLIENT } from '../../../helpers/redis/redis.module';
import { SocketGateway } from '../../socket.gateway/socket.gateway';
import { Queue } from 'bullmq';
import {
  BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE,
  BULLMQ_NOTIFY_PARTICIPANTS_QUEUE,
} from '../../../helpers/bullmq/bullmq.constants';

/**
 * Message Service
 *
 * 📚 MESSAGE MANAGEMENT SERVICE
 *
 * Features:
 * - Send messages
 * - Get messages with pagination
 * - Update messages
 * - Delete messages (soft delete)
 * - Mark messages as read
 * - Real-time updates via Socket.IO
 * - BullMQ async processing
 *
 * Compatible with Express.js message.service.ts
 */
@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(ConversationParticipents.name) private conversationParticipentsModel: Model<ConversationParticipentsDocument>,
    @Inject(REDIS_CLIENT) private redisClient: Redis,
    private socketGateway: SocketGateway,
    @Inject(BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE) private conversationLastMessageQueue: Queue,
    @Inject(BULLMQ_NOTIFY_PARTICIPANTS_QUEUE) private notifyParticipantsQueue: Queue,
  ) {}

  /**
   * Send Message
   *
   * Creates a new message in a conversation
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<MessageDocument> {
    const { text, attachments } = dto;

    // Verify conversation exists and user is a participant
    const conversation = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      isDeleted: false,
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const isParticipant = await this.conversationParticipentsModel.findOne({
      userId: new Types.ObjectId(senderId),
      conversationId: new Types.ObjectId(conversationId),
      isDeleted: false,
    });

    if (!isParticipant) {
      throw new BadRequestException('You are not a participant in this conversation');
    }

    // Create message
    const message = await this.messageModel.create({
      text,
      senderId: new Types.ObjectId(senderId),
      conversationId: new Types.ObjectId(conversationId),
      attachments: attachments?.map(id => new Types.ObjectId(id)) || [],
    });

    this.logger.log(`✅ Message created: ${message._id} in conversation ${conversationId}`);

    // Update conversation last message (async via BullMQ)
    await this.conversationLastMessageQueue.add(
      'update-conversation-last-message',
      {
        conversationId,
        lastMessageId: message._id.toString(),
        lastMessage: text,
      },
      {
        jobId: `conv-last-msg:${conversationId}:${Date.now()}`,
        removeOnComplete: true,
      },
    );

    // Notify participants (async via BullMQ)
    await this.notifyParticipantsInConversation(conversationId, message);

    // Emit real-time event via Socket.IO
    await this.emitNewMessageEvent(conversationId, message);

    return message;
  }

  /**
   * Get Messages by Conversation ID
   *
   * Retrieves messages with pagination
   */
  async getMessagesByConversation(
    conversationId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const messages = await this.messageModel.find({
      conversationId: new Types.ObjectId(conversationId),
      isDeleted: false,
    })
      .populate('senderId', 'name profileImage role')
      .populate('attachments')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const total = await this.messageModel.countDocuments({
      conversationId: new Types.ObjectId(conversationId),
      isDeleted: false,
    });

    // Mark messages as read
    await this.markMessagesAsRead(conversationId, userId, messages.map(m => m._id.toString()));

    return {
      results: messages.reverse(), // Return in chronological order
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalResults: total,
    };
  }

  /**
   * Get Messages with Cursor Pagination
   *
   * More efficient for real-time chat
   */
  async getMessagesWithCursor(
    conversationId: string,
    userId: string,
    options: {
      before?: string;
      after?: string;
      limit?: number;
    } = {},
  ): Promise<any> {
    const { before, after, limit = 20 } = options;

    const query: any = {
      conversationId: new Types.ObjectId(conversationId),
      isDeleted: false,
    };

    if (before) {
      query.createdAt = { $lt: new Date(await this.getMessageTimestamp(before)) };
    }

    if (after) {
      query.createdAt = { ...query.createdAt, $gt: new Date(await this.getMessageTimestamp(after)) };
    }

    const messages = await this.messageModel.find(query)
      .populate('senderId', 'name profileImage role')
      .populate('attachments')
      .sort({ createdAt: before ? -1 : 1 })
      .limit(limit + 1) // Fetch one extra to check if there are more
      .lean()
      .exec();

    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, limit) : messages;

    // Mark messages as read
    await this.markMessagesAsRead(
      conversationId,
      userId,
      resultMessages.map(m => m._id.toString()),
    );

    return {
      results: before ? resultMessages.reverse() : resultMessages,
      hasMore,
      nextCursor: hasMore ? resultMessages[resultMessages.length - 1]._id : null,
      prevCursor: resultMessages[0]?._id || null,
    };
  }

  /**
   * Update Message
   *
   * Updates message text (only by sender)
   */
  async updateMessage(
    messageId: string,
    userId: string,
    text: string,
  ): Promise<MessageDocument> {
    const message = await this.messageModel.findOne({
      _id: new Types.ObjectId(messageId),
      senderId: new Types.ObjectId(userId),
      isDeleted: false,
    });

    if (!message) {
      throw new NotFoundException('Message not found or you do not have permission to edit it');
    }

    message.text = text;
    await message.save();

    this.logger.log(`✅ Message updated: ${messageId}`);

    // Emit update event
    await this.socketGateway.emitToRoom(message.conversationId.toString(), 'message-updated', {
      messageId,
      text,
      updatedAt: message.updatedAt,
    });

    return message;
  }

  /**
   * Delete Message
   *
   * Soft delete message (only by sender)
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.messageModel.findOne({
      _id: new Types.ObjectId(messageId),
      senderId: new Types.ObjectId(userId),
      isDeleted: false,
    });

    if (!message) {
      throw new NotFoundException('Message not found or you do not have permission to delete it');
    }

    message.isDeleted = true;
    await message.save();

    this.logger.log(`✅ Message deleted: ${messageId}`);

    // Emit delete event
    await this.socketGateway.emitToRoom(message.conversationId.toString(), 'message-deleted', {
      messageId,
      conversationId: message.conversationId.toString(),
    });
  }

  /**
   * Mark Messages as Read
   *
   * Updates lastMessageReadAt for the user
   */
  async markMessagesAsRead(
    conversationId: string,
    userId: string,
    messageIds: string[],
  ): Promise<void> {
    if (!messageIds || messageIds.length === 0) return;

    const latestMessageId = messageIds[messageIds.length - 1];
    const latestMessage = await this.messageModel.findById(latestMessageId);

    if (!latestMessage) return;

    await this.conversationParticipentsModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        conversationId: new Types.ObjectId(conversationId),
      },
      {
        lastMessageReadAt: latestMessage.createdAt,
        lastMessageReadId: new Types.ObjectId(latestMessageId),
        isThisConversationUnseen: 0,
      },
      { upsert: true },
    );

    this.logger.debug(`✅ Messages marked as read for user ${userId} in conversation ${conversationId}`);
  }

  /**
   * Notify Participants in Conversation
   *
   * Queues notification job for all participants
   */
  private async notifyParticipantsInConversation(
    conversationId: string,
    message: MessageDocument,
  ): Promise<void> {
    try {
      const participants = await this.conversationParticipentsModel.find({
        conversationId: new Types.ObjectId(conversationId),
        isDeleted: false,
      }).select('userId');

      const participantIds = participants.map(p => p.userId.toString());

      // Get sender info (placeholder - integrate with User module)
      const sender = await this.getSenderInfo(message.senderId.toString());

      await this.notifyParticipantsQueue.add(
        'notify-participants',
        {
          conversationId,
          messageId: message._id.toString(),
          messageText: message.text,
          senderId: message.senderId.toString(),
          senderProfile: {
            name: sender.name,
            profileImage: sender.profileImage,
            role: sender.role,
          },
          participantIds,
        },
        {
          jobId: `notify-participants:${conversationId}:${Date.now()}`,
          removeOnComplete: true,
        },
      );

      this.logger.log(`📬 Queued notification for ${participantIds.length} participants`);
    } catch (error) {
      this.logger.error(`❌ Failed to notify participants: ${error.message}`);
    }
  }

  /**
   * Emit New Message Event via Socket.IO
   */
  private async emitNewMessageEvent(
    conversationId: string,
    message: MessageDocument,
  ): Promise<void> {
    try {
      const sender = await this.getSenderInfo(message.senderId.toString());

      await this.socketGateway.emitToRoom(conversationId, 'new-message-received', {
        _messageId: message._id.toString(),
        conversationId,
        text: message.text,
        senderId: message.senderId.toString(),
        senderName: sender.name,
        senderProfileImage: sender.profileImage,
        createdAt: message.createdAt,
        attachments: message.attachments,
      });

      this.logger.debug(`📡 Emitted new-message-received to room ${conversationId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to emit new message event: ${error.message}`);
    }
  }

  /**
   * Get Message Timestamp
   *
   * Helper for cursor pagination
   */
  private async getMessageTimestamp(messageId: string): Promise<Date> {
    const message = await this.messageModel.findById(messageId).select('createdAt').lean();
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return message.createdAt;
  }

  /**
   * Get Sender Info
   *
   * Placeholder - integrate with User module
   */
  private async getSenderInfo(userId: string): Promise<{ name: string; profileImage?: string; role: string }> {
    // TODO: Inject UserService and fetch actual user data
    // Example: return await this.userService.findById(userId);
    return {
      name: 'User',
      profileImage: null,
      role: 'user',
    };
  }

  /**
   * Get Unread Message Count
   *
   * Returns count of unread messages for a user in a conversation
   */
  async getUnreadCount(userId: string, conversationId: string): Promise<number> {
    const participent = await this.conversationParticipentsModel.findOne({
      userId: new Types.ObjectId(userId),
      conversationId: new Types.ObjectId(conversationId),
      isDeleted: false,
    }).select('lastMessageReadAt');

    if (!participent || !participent.lastMessageReadAt) {
      // All messages are unread
      return await this.messageModel.countDocuments({
        conversationId: new Types.ObjectId(conversationId),
        senderId: { $ne: new Types.ObjectId(userId) },
        isDeleted: false,
      });
    }

    // Count messages after last read
    return await this.messageModel.countDocuments({
      conversationId: new Types.ObjectId(conversationId),
      senderId: { $ne: new Types.ObjectId(userId) },
      createdAt: { $gt: participent.lastMessageReadAt },
      isDeleted: false,
    });
  }
}
