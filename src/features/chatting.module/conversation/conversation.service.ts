import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

import { PrismaService } from '@app/database';
import { REDIS_CLIENT } from '@app/redis';
import { SocketGateway } from '../../socket.gateway/socket.gateway';
import { SocketRoomService } from '../../socket.gateway/services/socket-room.service';
import {
  BULLMQ_CONVERSATION_LAST_MESSAGE_QUEUE,
  BULLMQ_NOTIFY_PARTICIPANTS_QUEUE,
} from '@app/queue';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationType, ParticipantRole } from './conversation.constant';

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

  async createConversation(
    dto: CreateConversationDto,
    creatorId: string,
  ): Promise<{ conversation: any; created: boolean }> {
    const { participants, message, groupName, groupProfilePicture } = dto;
    const allParticipants = [...new Set([...participants, creatorId])];

    if (allParticipants.length < 2) {
      throw new Error('At least 2 participants required');
    }

    const type = allParticipants.length > 2 ? ConversationType.GROUP : ConversationType.DIRECT;

    let existingConversation: any = null;
    if (type === ConversationType.DIRECT) {
      existingConversation = await this.findExistingDirectConversation(allParticipants);
    }

    if (!existingConversation) {
      const conversation = await this.prisma.conversation.create({
        data: {
          creatorId,
          type: type === ConversationType.GROUP ? 'group' : 'direct',
          groupName: groupName || null,
          groupProfilePicture: groupProfilePicture || null,
        },
      });

      await this.addParticipantsToConversation(conversation.id, allParticipants, creatorId);

      if (message) {
        await this.sendMessage(conversation.id, creatorId, message);
      }

      return { conversation, created: true };
    }

    if (message) {
      await this.sendMessage(existingConversation.id, creatorId, message);
    }

    return { conversation: existingConversation, created: false };
  }

  private async findExistingDirectConversation(participantIds: string[]): Promise<any | null> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        type: 'direct',
        participants: {
          every: { userId: { in: participantIds } },
        },
      },
      include: { participants: true },
    });

    for (const conv of conversations) {
      if (conv.participants.length === participantIds.length) {
        const participantUserIds = conv.participants.map(p => p.userId).sort();
        if (JSON.stringify(participantUserIds) === JSON.stringify([...participantIds].sort())) {
          return conv;
        }
      }
    }
    return null;
  }

  async addParticipantsToConversation(
    conversationId: string,
    participantIds: string[],
    creatorId: string,
  ): Promise<void> {
    for (const participantId of participantIds) {
      const existing = await this.prisma.conversationParticipents.findFirst({
        where: { userId: participantId, conversationId, isDeleted: false },
      });

      if (existing) continue;

      const user = await this.getUserInfo(participantId);

      await this.prisma.conversationParticipents.create({
        data: {
          conversationId,
          userId: participantId,
          userName: user.name,
          role: user.role === 'admin' ? ParticipantRole.ADMIN : ParticipantRole.MEMBER,
        },
      });
      this.logger.log(`✅ Participant added: ${participantId} to conversation ${conversationId}`);
    }
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    text: string,
    attachments?: string[],
  ): Promise<any> {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        text,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageId: message.id,
        lastMessageText: text,
        lastMessageCreatedAt: message.createdAt,
      },
    });

    await this.conversationLastMessageQueue.add('update-conversation-last-message', {
      conversationId,
      lastMessageId: message.id,
      lastMessage: text,
    });

    await this.notifyParticipantsInConversation(conversationId, message);

    return message;
  }

  private async notifyParticipantsInConversation(conversationId: string, message: any): Promise<void> {
    const participants = await this.prisma.conversationParticipents.findMany({
      where: { conversationId, isDeleted: false },
      select: { userId: true },
    });
    const participantIds = participants.map(p => p.userId);
    const sender = await this.getUserInfo(message.senderId);

    await this.notifyParticipantsQueue.add('notify-participants', {
      conversationId,
      messageId: message.id,
      messageText: message.text,
      senderId: message.senderId,
      senderProfile: { name: sender.name, profileImage: sender.profileImage, role: sender.role },
      participantIds,
    });
  }

  async getConversationsByUserId(userId: string, page: number = 1, limit: number = 10): Promise<any> {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { lastMessageCreatedAt: 'desc' },
      include: { participants: true },
    });

    return conversations;
  }

  async markAsRead(userId: string, conversationId: string): Promise<void> {
    await this.prisma.messageReadStatus.updateMany({
      where: { conversationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  private async getUserInfo(userId: string): Promise<{ name: string; role: string; profileImage?: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true, profileImageUrl: true } });
    return { name: user?.name || 'User', role: user?.role || 'user', profileImage: user?.profileImageUrl || undefined };
  }
}
