import { Injectable, Inject, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../../helpers/redis/redis.module';

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
 * 
 * Features:
 * - JWT token validation for Socket.IO
 * - Online user tracking in Redis
 * - User reconnection handling
 * - Related online users fetching
 * 
 * Compatible with Express.js redisStateManagerForSocketV2.ts
 */
@Injectable()
export class SocketAuthService {
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
  ) {}

  /**
   * Authenticate Socket Connection
   * 
   * @param socket - Socket.IO client
   * @returns User payload if valid
   */
  async authenticateSocket(socket: Socket): Promise<{ userId: string; role: string } | null> {
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

      return {
        userId: payload.userId,
        role: payload.role,
      };
    } catch (error) {
      this.logger.error(`❌ Socket authentication error: ${error.message}`);
      return null;
    }
  }

  /**
   * Handle User Connection
   * 
   * @param socket - Socket.IO client
   * @param user - User payload
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
   * 
   * @param socket - Socket.IO client
   * @param userId - User ID
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
   * For now, returns all online users
   * TODO: Integrate with conversation service to get only related users
   */
  async getRelatedOnlineUsers(userId: string): Promise<string[]> {
    try {
      const allOnlineUsers = await this.getAllOnlineUsers();

      // TODO: Filter to only related users (conversations, family, etc.)
      // For now, return all online users
      return allOnlineUsers;
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
}
