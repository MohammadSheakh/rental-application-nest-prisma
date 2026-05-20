import { Injectable, Logger, Inject } from '@nestjs/common';
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

  async createConversation(dto: CreateConversationDto, creatorId: string) {
    const { participants, message, groupName, groupProfilePicture } = dto;
    const allParticipants = [...new Set([...participants, creatorId])];
    if (allParticipants.length < 2) throw new Error('At least 2 participants required');
    const type = allParticipants.length > 2 ? ConversationType.GROUP : ConversationType.DIRECT;

    let existingConversation = null;
    if (type === ConversationType.DIRECT) {
      existingConversation = await this.findExistingDirectConversation(allParticipants);
    }

    if (!existingConversation) {
      const conversation = await this.prisma.conversation.create({
        data: {
          creatorId,
          type: type === ConversationType.GROUP ? 'group' : 'direct',
          groupName,
          groupProfilePicture,
        },
      });
      await this.addParticipantsToConversation(conversation.id, allParticipants, creatorId);
      if (message) await this.sendMessage(conversation.id, creatorId, message);
      return { conversation, created: true };
    }

    if (message) await this.sendMessage(existingConversation.id, creatorId, message);
    return { conversation: existingConversation, created: false };
  }

  private async findExistingDirectConversation(participantIds: string[]) {
    const conversations = await this.prisma.conversation.findMany({
      where: { type: 'direct', participants: { every: { userId: { in: participantIds } } } },
      include: { participants: { select: { userId: true } } },
    });
    return conversations.find(c => c.participants.length === participantIds.length && 
      JSON.stringify(c.participants.map(p => p.userId).sort()) === JSON.stringify([...participantIds].sort())) || null;
  }

  async addParticipantsToConversation(conversationId: string, participantIds: string[], creatorId: string) {
    for (const userId of participantIds) {
      const existing = await this.prisma.conversationParticipents.findFirst({ where: { userId, conversationId, isDeleted: false } });
      if (existing) continue;
      const user = await this.getUserInfo(userId);
      await this.prisma.conversationParticipents.create({
        data: { conversationId, userId, userName: user.name, role: userId === creatorId ? ParticipantRole.ADMIN : ParticipantRole.MEMBER },
      });
    }
  }

  async sendMessage(conversationId: string, senderId: string, text: string, attachments?: string[]) {
    const message = await this.prisma.message.create({ data: { conversationId, senderId, text } });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageId: message.id, lastMessageText: text, lastMessageCreatedAt: message.createdAt } });
    await this.conversationLastMessageQueue.add('update-conversation-last-message', { conversationId, lastMessageId: message.id, lastMessage: text });
    await this.notifyParticipantsInConversation(conversationId, message);
    return message;
  }

  private async notifyParticipantsInConversation(conversationId: string, message: any) {
    const participants = await this.prisma.conversationParticipents.findMany({ where: { conversationId, isDeleted: false }, select: { userId: true } });
    const participantIds = participants.map(p => p.userId);
    const sender = await this.getUserInfo(message.senderId);
    await this.notifyParticipantsQueue.add('notify-participants', {
      conversationId, messageId: message.id, messageText: message.text, senderId: message.senderId,
      senderProfile: { name: sender.name, profileImage: sender.profileImage, role: sender.role },
      participantIds,
    });
  }

  async getConversationsByUserId(userId: string, page: number = 1, limit: number = 10, search: string = '') {
    const participents = await this.prisma.conversationParticipents.findMany({
      where: { userId, isDeleted: false },
      include: { conversation: { include: { participants: { include: { user: true } } } } },
    });

    const results = await Promise.all(participents.map(async (p) => {
      const unreadCount = await this.prisma.message.count({
        where: { conversationId: p.conversationId, senderId: { not: userId }, createdAt: { gt: p.lastMessageReadAt || new Date(0) }, isDeleted: false }
      });
      return { participent: p, unreadCount };
    }));

    const uniqueUsers: Record<string, any> = {};
    for (const { participent, unreadCount } of results) {
      const otherParticipant = participent.conversation.participants.find(p => p.userId !== userId);
      if (!otherParticipant) continue;
      const otherUserId = otherParticipant.userId;
      if (!uniqueUsers[otherUserId]) {
        uniqueUsers[otherUserId] = { userId: { _userId: otherUserId, name: otherParticipant.userName }, conversations: [], isOnline: await this.socketGateway.isUserOnline(otherUserId) };
      }
      uniqueUsers[otherUserId].conversations.push({ _conversationId: participent.conversationId, lastMessage: participent.conversation.lastMessageText, updatedAt: participent.conversation.lastMessageCreatedAt, unreadCount });
    }
    return { results: Object.values(uniqueUsers), page, limit, totalPages: Math.ceil(results.length / limit), totalResults: results.length };
  }

  async removeParticipant(conversationId: string, participantId: string) {
    await this.prisma.conversationParticipents.updateMany({ where: { conversationId, userId: participantId }, data: { isDeleted: true } });
    await this.socketGateway.emitToRoom(conversationId, 'participant-removed', { conversationId, participantId });
  }

  async markAsRead(userId: string, conversationId: string) {
    await this.prisma.conversationParticipents.updateMany({
      where: { conversationId, userId },
      data: { lastMessageReadAt: new Date(), unreadCount: 0 },
    });
  }

  private async getUserInfo(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true, profileImageUrl: true } });
    return { name: user?.name || 'User', role: user?.role || 'user', profileImage: user?.profileImageUrl || undefined };
  }
}
