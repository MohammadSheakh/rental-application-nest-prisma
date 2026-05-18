import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { REDIS_CLIENT } from '../../../core/database/redis/redis.constants';
import { PrismaService } from '../../../core/database/prisma/prisma.service';
import { ConversationParticipents, ConversationParticipentsDocument } from '../../chatting.module/conversationParticipents/conversationParticipents.schema';

interface UserConnectionInfo {
  socketId: string;
  workerId: string;
  connectedAt: number;
  userInfo?: any;
}

/**
 * Socket Auth Service
 * 
 * 📚 SOCKET.IO AUTHENTICATION & USER TRACKING
 */
@Injectable()
export class SocketAuthService implements OnModuleInit {
  private readonly logger = new Logger(SocketAuthService.name);
  private readonly KEYS = {
    ONLINE_USERS: 'chat:online_users',
    USER_SOCKET_MAP: 'chat:user_socket_map:',
    SOCKET_USER_MAP: 'chat:socket_user_map:',
    USER_STATUS: 'chat:user_status:',
  };

  constructor(
    private jwtService: JwtService,
    @Inject(REDIS_CLIENT) private redisClient: Redis,
    private prisma: PrismaService,
    @InjectModel(ConversationParticipents.name) private conversationParticipentsModel: Model<ConversationParticipentsDocument>,
  ) {}

  onModuleInit() {
    this.startCleanupJob();
  }

  /**
   * Authenticate Socket Connection
   */
  async authenticateSocket(socket: Socket): Promise<{ userId: string; role: string; name: string } | null> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.token as string;

      if (!token) {
        this.logger.warn('❌ Socket authentication failed: No token provided');
        return null;
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'fallback-secret',
      });

      if (!payload || !payload.userId) {
        this.logger.warn('❌ Socket authentication failed: Invalid token payload');
        return null;
      }

      // Fetch user profile from Prisma for full info
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, role: true, name: true },
      });

      if (!user) {
        this.logger.warn(`❌ Socket authentication failed: User ${payload.userId} not found`);
        return null;
      }

      return {
        userId: user.id,
        role: user.role,
        name: user.name,
      };
    } catch (error) {
      this.logger.error(`❌ Socket authentication error: ${error.message}`);
      return null;
    }
  }

  /**
   * Handle User Connection
   */
  async handleUserConnection(socket: Socket, user: { userId: string; role: string }): Promise<string | null> {
    const userId = user.userId;
    const socketId = socket.id;
    const workerId = process.pid.toString();

    // Check for existing connection
    const existingInfo = await this.getUserConnectionInfo(userId);

    if (existingInfo && existingInfo.socketId !== socketId) {
      this.logger.log(
        `🔄 User ${userId} reconnecting. Old socket: ${existingInfo.socketId}, New socket: ${socketId}`,
      );

      // Clean up old socket mapping
      await this.redisClient.del(`${this.KEYS.SOCKET_USER_MAP}${existingInfo.socketId}`);

      // Return old socket ID so caller can disconnect it
      return existingInfo.socketId;
    }

    // Add new connection
    await this.addOnlineUser(userId, socketId, workerId, user);

    this.logger.log(`✅ User ${userId} connected (Socket: ${socketId}, Worker: ${workerId})`);

    return null;
  }

  /**
   * Handle User Disconnection
   */
  async handleUserDisconnection(socket: Socket, userId: string): Promise<void> {
    const socketId = socket.id;

    this.logger.log(`🔌 User disconnected: ${userId} (Socket: ${socketId})`);

    try {
      // Remove from Redis state
      await this.removeOnlineUser(userId, socketId);
    } catch (error) {
      this.logger.error(`❌ Error handling user disconnection: ${error.message}`);
    }
  }

  /**
   * Add Online User to Redis
   */
  private async addOnlineUser(
    userId: string,
    socketId: string,
    workerId: string,
    userInfo?: any,
  ): Promise<void> {
    const pipeline = this.redisClient.multi();

    // Add to online users set
    pipeline.sadd(this.KEYS.ONLINE_USERS, userId);

    // Store user-socket mapping
    pipeline.hset(`${this.KEYS.USER_SOCKET_MAP}${userId}`, {
      socketId,
      workerId,
      connectedAt: Date.now().toString(),
      userInfo: JSON.stringify(userInfo || {}),
    });

    // Store socket-user mapping
    pipeline.hset(`${this.KEYS.SOCKET_USER_MAP}${socketId}`, {
      userId,
    });

    // Set user status
    pipeline.hset(`${this.KEYS.USER_STATUS}${userId}`, {
      isOnline: 'true',
      lastSeen: Date.now().toString(),
      workerId,
    });

    await pipeline.exec();

    this.logger.debug(`✅ User ${userId} added to Redis state (Worker: ${workerId})`);
  }

  /**
   * Remove Online User from Redis
   */
  private async removeOnlineUser(userId: string, socketId: string): Promise<void> {
    const pipeline = this.redisClient.multi();

    // Remove from online users set
    pipeline.srem(this.KEYS.ONLINE_USERS, userId);

    // Remove user-socket mapping
    pipeline.del(`${this.KEYS.USER_SOCKET_MAP}${userId}`);

    // Remove socket-user mapping
    pipeline.del(`${this.KEYS.SOCKET_USER_MAP}${socketId}`);

    // Update user status to offline
    pipeline.hset(`${this.KEYS.USER_STATUS}${userId}`, {
      isOnline: 'false',
      lastSeen: Date.now().toString(),
    });

    await pipeline.exec();

    this.logger.debug(`❌ User ${userId} removed from Redis state`);
  }

  /**
   * Get User Connection Info
   */
  async getUserConnectionInfo(userId: string): Promise<UserConnectionInfo | null> {
    const info = await this.redisClient.hgetall(`${this.KEYS.USER_SOCKET_MAP}${userId}`);

    if (!info || Object.keys(info).length === 0) {
      return null;
    }

    return {
      socketId: info.socketId,
      workerId: info.workerId,
      connectedAt: parseInt(info.connectedAt, 10),
      userInfo: info.userInfo ? JSON.parse(info.userInfo) : undefined,
    };
  }

  /**
   * Check if User is Online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const isMember = await this.redisClient.sismember(this.KEYS.ONLINE_USERS, userId);
    return isMember === 1;
  }

  /**
   * Get All Online Users
   */
  async getAllOnlineUsers(): Promise<string[]> {
    return await this.redisClient.smembers(this.KEYS.ONLINE_USERS);
  }

  /**
   * Get Related Online Users
   * 
   * Returns online users that the current user is related to (family or conversations)
   */
  async getRelatedOnlineUsers(userId: string): Promise<string[]> {
    try {
      const allOnlineUsers = await this.getAllOnlineUsers();
      if (allOnlineUsers.length === 0) return [];

      const relatedUserIds = new Set<string>();

      // 1. Get family-related users from Prisma
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, accountCreatorId: true, childAccounts: { select: { id: true } } },
      });

      if (user) {
        if (user.accountCreatorId) relatedUserIds.add(user.accountCreatorId);
        user.childAccounts.forEach(child => relatedUserIds.add(child.id));
      }

      // 2. Get conversation-related users from Mongoose
      const userParticipations = await this.conversationParticipentsModel.find({
        userId: new Types.ObjectId(userId),
        isDeleted: false,
      }).select('conversationId');

      if (userParticipations.length > 0) {
        const conversationIds = userParticipations.map(p => p.conversationId);
        const otherParticipants = await this.conversationParticipentsModel.find({
          conversationId: { $in: conversationIds },
          userId: { $ne: new Types.ObjectId(userId) },
          isDeleted: false,
        }).select('userId');

        otherParticipants.forEach(p => relatedUserIds.add(p.userId.toString()));
      }

      // Filter only those who are online
      const relatedOnlineUsers = allOnlineUsers.filter(onlineId => 
        relatedUserIds.has(onlineId) || onlineId === userId
      );

      return relatedOnlineUsers;
    } catch (error) {
      this.logger.error(`❌ Error getting related online users: ${error.message}`);
      return [];
    }
  }

  /**
   * Get Online Users Count
   */
  async getOnlineUsersCount(): Promise<number> {
    return await this.redisClient.scard(this.KEYS.ONLINE_USERS);
  }

  /**
   * Get System Stats
   */
  async getSystemStats(): Promise<any> {
    return {
      totalOnlineUsers: await this.getOnlineUsersCount(),
      onlineUsers: await this.getAllOnlineUsers(),
      timestamp: Date.now(),
    };
  }

  /**
   * Start Cleanup Job
   */
  private startCleanupJob() {
    setInterval(async () => {
      try {
        const onlineUsers = await this.getAllOnlineUsers();
        const staleThreshold = Date.now() - 5 * 60 * 1000; // 5 minutes

        for (const userId of onlineUsers) {
          const connectionInfo = await this.getUserConnectionInfo(userId);

          if (connectionInfo && connectionInfo.connectedAt < staleThreshold) {
            this.logger.warn(`🧹 Cleaning up stale connection for user ${userId}`);
            await this.removeOnlineUser(userId, connectionInfo.socketId);
          }
        }
      } catch (error) {
        this.logger.error(`❌ Error in cleanup job: ${error.message}`);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }
}
