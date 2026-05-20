import { Injectable, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

import { PrismaService } from '@app/database';
import { GenericService } from '@app/common';
import { REDIS_CLIENT } from '@app/redis';
import { SocketGateway } from '../../socket.gateway/socket.gateway';
import { SocketRoomService } from '../../socket.gateway/services/socket-room.service';
import {
  BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE,
  BULLMQ_NOTIFY_PARTICIPANTS_QUEUE,
} from '@app/queue';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationType, ParticipantRole } from './conversation.constant';

/**
 * Conversation Service
 *
 * 📚 CONVERSATION MANAGEMENT SERVICE
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
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
  ): Promise<{ conversation: any; created: boolean }> {
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
    let existingConversation: any = null;

    if (type === ConversationType.DIRECT) {
      existingConversation = await this.findExistingDirectConversation(allParticipants);
    }

    // Create new conversation if not exists
    if (!existingConversation) {
      const conversationData: any = {
        creatorId: creatorId,
        type: type === ConversationType.GROUP ? 'group' : 'direct',
        ...(type === ConversationType.GROUP && {
          groupName: groupName || null,
          groupProfilePicture: groupProfilePicture || null,
        }),
      };

      const conversation = await this.prisma.conversation.create({ data: conversationData });

      this.logger.log(`✅ Conversation created: ${conversation.id} (type: ${type})`);

      // Add participants
      await this.addParticipantsToConversation(conversation.id, allParticipants, creatorId);

      // Send initial message if provided
      if (message) {
        await this.sendMessage(conversation.id, creatorId, message);
      }

      return { conversation, created: true };
    }

    // Send message to existing conversation
    if (message) {
      await this.sendMessage(existingConversation.id, creatorId, message);
    }

    return { conversation: existingConversation, created: false };
  }

  /**
   * Find Existing Direct Conversation
   */
  private async findExistingDirectConversation(participantIds: string[]): Promise<any | null> {
    // Implement using Prisma
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
      // Implement using Prisma
  }

  /**
   * Send Message
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    text: string,
    attachments?: string[],
  ): Promise<any> {
      // Implement using Prisma
      return {};
  }

  /**
   * Notify Participants in Conversation
   */
  private async notifyParticipantsInConversation(
    conversationId: string,
    message: any,
  ): Promise<void> {
      // Implement using Prisma
  }

  /**
   * Get Conversations by User ID with Pagination
   */
  async getConversationsByUserId(
    userId: string,
    page: number = 1,
    limit: number = 10,
    search: string = '',
  ): Promise<any> {
      // Implement using Prisma
      return {};
  }

  /**
   * Remove Participant from Conversation
   */
  async removeParticipant(
    conversationId: string,
    participantId: string,
  ): Promise<void> {
      // Implement using Prisma
  }

  /**
   * Mark Conversation as Read
   */
  async markAsRead(userId: string, conversationId: string): Promise<void> {
      // Implement using Prisma
  }

  /**
   * Get User Info (Placeholder)
   */
  private async getUserInfo(userId: string): Promise<{ name: string; role: string; profileImage?: string }> {
    return {
      name: 'User',
      role: 'user',
      profileImage: null,
    };
  }
}
