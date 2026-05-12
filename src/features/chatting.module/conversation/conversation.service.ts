import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Redis } from 'ioredis';

import { Conversation, ConversationDocument } from './conversation.schema';
import { ConversationParticipents, ConversationParticipentsDocument } from '../conversationParticipents/conversationParticipents.schema';
import { Message, MessageDocument } from '../message/message.schema';
import { CreateConversationDto, AddParticipantsDto } from './dto/create-conversation.dto';
import { ConversationType, ParticipantRole } from './conversation.constant';
import { REDIS_CLIENT } from '../../../helpers/redis/redis.module';
import { SocketGateway } from '../../socket.gateway/socket.gateway';
import { SocketRoomService } from '../../socket.gateway/services/socket-room.service';
import { Queue } from 'bullmq';
import {
  BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE,
  BULLMQ_NOTIFY_PARTICIPANTS_QUEUE,
  QUEUE_NAMES,
} from '../../../helpers/bullmq/bullmq.constants';

/**
 * Conversation Service
 *
 * 📚 CONVERSATION MANAGEMENT SERVICE
 *
 * Features:
 * - Create conversations (direct & group)
 * - Manage participants
 * - Real-time updates via Socket.IO
 * - Redis state management
 * - BullMQ async processing
 *
 * Compatible with Express.js conversation.service.ts
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(ConversationParticipents.name) private conversationParticipentsModel: Model<ConversationParticipentsDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @Inject(REDIS_CLIENT) private redisClient: Redis,
    private socketGateway: SocketGateway,
    private socketRoomService: SocketRoomService,
    @Inject(BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE) private conversationLastMessageQueue: Queue,
    @Inject(BULLMQ_NOTIFY_PARTICIPANTS_QUEUE) private notifyParticipantsQueue: Queue,
  ) {}

  /**
   * Create Conversation
   *
   * Creates a new conversation with participants
   * Checks for existing direct conversations to avoid duplicates
   */
  async createConversation(
    dto: CreateConversationDto,
    creatorId: string,
  ): Promise<{ conversation: ConversationDocument; created: boolean }> {
    const { participants, message, groupName, groupProfilePicture } = dto;

    // Add creator to participants
    const allParticipants = [...new Set([...participants, creatorId])];

    if (allParticipants.length < 2) {
      throw new Error('At least 2 participants required');
    }

    // Determine conversation type
    const type = allParticipants.length > 2
      ? ConversationType.GROUP
      : ConversationType.DIRECT;

    // Check for existing direct conversation
    let existingConversation: ConversationDocument | null = null;

    if (type === ConversationType.DIRECT) {
      existingConversation = await this.findExistingDirectConversation(allParticipants);
    }

    // Create new conversation if not exists
    if (!existingConversation) {
      const conversationData: Partial<Conversation> = {
        creatorId: new Types.ObjectId(creatorId),
        type,
        ...(type === ConversationType.GROUP && {
          groupName: groupName || null,
          groupProfilePicture: groupProfilePicture || null,
        }),
      };

      const conversation = await this.conversationModel.create(conversationData);

      this.logger.log(`✅ Conversation created: ${conversation._id} (type: ${type})`);

      // Add participants
      await this.addParticipantsToConversation(conversation._id.toString(), allParticipants, creatorId);

      // Send initial message if provided
      if (message) {
        await this.sendMessage(conversation._id.toString(), creatorId, message);
      }

      return { conversation, created: true };
    }

    // Send message to existing conversation
    if (message) {
      await this.sendMessage(existingConversation._id.toString(), creatorId, message);
    }

    return { conversation: existingConversation, created: false };
  }

  /**
   * Find Existing Direct Conversation
   *
   * Checks if a direct conversation already exists between participants
   */
  private async findExistingDirectConversation(participantIds: string[]): Promise<ConversationDocument | null> {
    const participantObjectIds = participantIds.map(id => new Types.ObjectId(id));

    // Find conversations where exactly these participants exist
    const conversationsWithParticipants = await this.conversationParticipentsModel.aggregate([
      {
        $match: {
          userId: { $in: participantObjectIds },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$conversationId',
          participantCount: { $sum: 1 },
          participantIds: { $push: '$userId' },
        },
      },
      {
        $match: {
          participantCount: participantIds.length,
        },
      },
    ]);

    if (conversationsWithParticipants.length === 0) {
      return null;
    }

    // Check for exact participant match
    for (const conv of conversationsWithParticipants) {
      const existingIds = conv.participantIds.map((id: Types.ObjectId) => id.toString()).sort();
      const newIds = [...participantIds].sort();

      if (JSON.stringify(existingIds) === JSON.stringify(newIds)) {
        const conversation = await this.conversationModel.findOne({
          _id: conv._id,
          type: ConversationType.DIRECT,
          isDeleted: false,
        });

        if (conversation) {
          this.logger.log(`✅ Found existing direct conversation: ${conversation._id}`);
          return conversation;
        }
      }
    }

    return null;
  }

  /**
   * Add Participants to Conversation
   */
  async addParticipantsToConversation(
    conversationId: string,
    participantIds: string[],
    creatorId: string,
  ): Promise<void> {
    for (const participantId of participantIds) {
      // Skip if already a participant
      const existing = await this.conversationParticipentsModel.findOne({
        userId: new Types.ObjectId(participantId),
        conversationId: new Types.ObjectId(conversationId),
        isDeleted: false,
      });

      if (existing) {
        continue;
      }

      // Get user info (you'll need to inject UserModel or use a UserService)
      // For now, we'll use a placeholder - implement based on your User module
      const user = await this.getUserInfo(participantId);

      await this.conversationParticipentsModel.create({
        userId: new Types.ObjectId(participantId),
        userName: user.name,
        conversationId: new Types.ObjectId(conversationId),
        role: user.role === 'admin' ? ParticipantRole.ADMIN : ParticipantRole.MEMBER,
        joinedAt: new Date(),
      });

      this.logger.log(`✅ Participant added: ${participantId} to conversation ${conversationId}`);
    }
  }

  /**
   * Send Message
   *
   * Creates a message and updates conversation last message
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    text: string,
    attachments?: string[],
  ): Promise<MessageDocument> {
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
      },
    );

    // Notify participants (async via BullMQ)
    await this.notifyParticipantsInConversation(conversationId, message);

    return message;
  }

  /**
   * Notify Participants in Conversation
   *
   * Emits real-time updates to all participants via Socket.IO
   */
  private async notifyParticipantsInConversation(
    conversationId: string,
    message: MessageDocument,
  ): Promise<void> {
    try {
      // Get all participants
      const participants = await this.conversationParticipentsModel.find({
        conversationId: new Types.ObjectId(conversationId),
        isDeleted: false,
      }).select('userId');

      const participantIds = participants.map(p => p.userId.toString());

      // Get sender info
      const sender = await this.getUserInfo(message.senderId.toString());

      // Queue notification to all participants
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
        },
      );

      this.logger.log(`📬 Queued notification for ${participantIds.length} participants`);
    } catch (error) {
      this.logger.error(`❌ Failed to notify participants: ${error.message}`);
    }
  }

  /**
   * Get Conversations by User ID with Pagination
   *
   * Returns all conversations for a user with unread counts
   */
  async getConversationsByUserId(
    userId: string,
    page: number = 1,
    limit: number = 10,
    search: string = '',
  ): Promise<any> {
    const loggedInUserId = new Types.ObjectId(userId);

    // Step 1: Get all conversations the user is in
    const userParticipents = await this.conversationParticipentsModel.find({
      userId: loggedInUserId,
      isDeleted: false,
    }).select('conversationId lastMessageReadAt');

    const conversationIds = userParticipents.map(p => p.conversationId);
    const lastReadMap = new Map<string, Date | null>();
    userParticipents.forEach(p => {
      lastReadMap.set(p.conversationId.toString(), p.lastMessageReadAt);
    });

    if (conversationIds.length === 0) {
      return { results: [], page: 1, limit, totalPages: 0, totalResults: 0 };
    }

    // Step 2: Find other participants
    const filter: any = {
      conversationId: { $in: conversationIds },
      userId: { $ne: loggedInUserId },
      isDeleted: false,
    };

    if (search) {
      filter.userName = { $regex: search, $options: 'i' };
    }

    const participents = await this.conversationParticipentsModel.find(filter)
      .populate('userId', 'name profileImage role')
      .populate({
        path: 'conversationId',
        select: 'lastMessage lastMessageId updatedAt',
      })
      .sort({ 'conversationId.updatedAt': -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await this.conversationParticipentsModel.countDocuments(filter);

    // Step 3: Calculate unread counts
    const results = [];
    for (const participent of participents) {
      const convoId = participent.conversationId._id.toString();
      const lastReadAt = lastReadMap.get(convoId) || null;

      // Count unread messages
      let unreadCount = 0;
      if (lastReadAt) {
        unreadCount = await this.messageModel.countDocuments({
          conversationId: participent.conversationId._id,
          senderId: { $ne: loggedInUserId },
          createdAt: { $gt: lastReadAt },
          isDeleted: false,
        });
      } else {
        unreadCount = await this.messageModel.countDocuments({
          conversationId: participent.conversationId._id,
          senderId: { $ne: loggedInUserId },
          isDeleted: false,
        });
      }

      results.push({
        participent,
        unreadCount,
      });
    }

    // Step 4: Group by other user
    const uniqueUsers: Record<string, any> = {};
    for (const { participent, unreadCount } of results) {
      const otherUserId = participent.userId._id.toString();
      const convoId = participent.conversationId._id.toString();

      if (!uniqueUsers[otherUserId]) {
        uniqueUsers[otherUserId] = {
          userId: {
            _userId: participent.userId._id,
            name: participent.userId.name,
            profileImage: participent.userId.profileImage,
            role: participent.userId.role,
          },
          conversations: [],
          isOnline: await this.socketGateway.isUserOnline(otherUserId),
        };
      }

      const exists = uniqueUsers[otherUserId].conversations.some(
        (c: any) => c._conversationId.toString() === convoId,
      );

      if (!exists) {
        uniqueUsers[otherUserId].conversations.push({
          _conversationId: convoId,
          lastMessage: participent.conversationId.lastMessage,
          updatedAt: participent.conversationId.updatedAt,
          unreadCount,
        });
      }
    }

    return {
      results: Object.values(uniqueUsers),
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalResults: total,
    };
  }

  /**
   * Remove Participant from Conversation
   */
  async removeParticipant(
    conversationId: string,
    participantId: string,
  ): Promise<void> {
    await this.conversationParticipentsModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(participantId),
        conversationId: new Types.ObjectId(conversationId),
      },
      { isDeleted: true },
    );

    this.logger.log(`✅ Participant removed: ${participantId} from conversation ${conversationId}`);

    // Emit socket event
    await this.socketGateway.emitToRoom(conversationId, 'participant-removed', {
      conversationId,
      participantId,
    });
  }

  /**
   * Mark Conversation as Read
   */
  async markAsRead(userId: string, conversationId: string): Promise<void> {
    await this.conversationParticipentsModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        conversationId: new Types.ObjectId(conversationId),
      },
      {
        lastMessageReadAt: new Date(),
        isThisConversationUnseen: 0,
      },
    );

    this.logger.log(`✅ Conversation ${conversationId} marked as read by user ${userId}`);
  }

  /**
   * Get User Info (Placeholder)
   *
   * TODO: Inject UserService or UserModel to fetch user data
   */
  private async getUserInfo(userId: string): Promise<{ name: string; role: string; profileImage?: string }> {
    // Placeholder - replace with actual user lookup
    // Example: return await this.userService.findById(userId);
    return {
      name: 'User',
      role: 'user',
      profileImage: null,
    };
  }
}
