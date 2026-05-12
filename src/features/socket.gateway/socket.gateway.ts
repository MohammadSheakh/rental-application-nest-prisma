import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { SocketAuthService } from './socket-auth.service';
import { SocketRoomService } from './socket-room.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';

/**
 * Socket.IO Gateway
 * 
 * 📚 REAL-TIME NOTIFICATION & CHAT GATEWAY
 * 
 * Features:
 * - JWT Authentication
 * - Room Management (chat, tasks, family)
 * - Online User Tracking
 * - Real-time Notifications
 * - Redis Adapter for Multi-Worker
 * 
 * Events (Client → Server):
 * - 'join' - Join conversation room
 * - 'leave' - Leave conversation room
 * - 'join-task' - Join task room
 * - 'leave-task' - Leave task room
 * - 'send-message' - Send chat message
 * - 'get-online-users' - Get related online users
 * 
 * Events (Server → Client):
 * - 'notification::userId' - New notification
 * - 'notification:unread-count::userId' - Unread count update
 * - 'user-joined-chat' - User joined conversation
 * - 'user-left-chat' - User left conversation
 * - 'new-message-received' - New message received
 * - 'user-joined-task' - User joined task
 * - 'user-left-task' - User left task
 * - 'task-status-updated' - Task status changed
 */
@WebSocketGateway({
  cors: {
    origin: '*', // Configure in production
    credentials: true,
  },
  namespace: 'socket.io',
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SocketGateway.name);

  constructor(
    private jwtService: JwtService,
    private socketAuthService: SocketAuthService,
    private socketRoomService: SocketRoomService,
  ) {}

  /**
   * Gateway Initialization
   */
  afterInit(server: Server) {
    this.logger.log('✅ Socket.IO Gateway initialized');
    
    // Attach Redis adapter for multi-worker support
    // TODO: Import createAdapter from @socket.io/redis-adapter
    // const adapter = createAdapter(redisPubClient, redisSubClient);
    // server.adapter(adapter);
  }

  /**
   * Handle Client Connection
   */
  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      // Authenticate user
      const user = await this.socketAuthService.authenticateSocket(client);

      if (!user) {
        this.logger.warn(`❌ Socket authentication failed: ${client.id}`);
        client.emit('io-error', {
          success: false,
          message: 'Authentication failed',
        });
        client.disconnect();
        return;
      }

      // Store user in socket data
      client.data.user = user;
      client.data.userId = user.userId;

      this.logger.log(
        `🔌 User connected: ${user.userId} (Socket: ${client.id})`,
      );

      // Handle user connection in Redis
      await this.socketAuthService.handleUserConnection(client, user);

      // Auto-join user's personal room
      client.join(user.userId);
      this.logger.log(`✅ User ${user.userId} joined personal room`);

      // Auto-join role-based room
      if (user.role) {
        client.join(`role::${user.role}`);
        this.logger.log(`✅ User ${user.userId} joined role room: role::${user.role}`);
      }

      // Auto-join family room (if applicable)
      await this.socketRoomService.autoJoinFamilyRoom(client, user.userId);

      // Emit connection success
      client.emit('connected', {
        success: true,
        userId: user.userId,
        socketId: client.id,
      });
    } catch (error) {
      this.logger.error(`❌ Connection error: ${error.message}`);
      client.emit('io-error', {
        success: false,
        message: 'Connection error',
      });
      client.disconnect();
    }
  }

  /**
   * Handle Client Disconnection
   */
  async handleDisconnect(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;

    if (userId) {
      this.logger.log(`🔌 User disconnected: ${userId} (Socket: ${client.id})`);

      // Handle user disconnection in Redis
      await this.socketAuthService.handleUserDisconnection(client, userId);
    }
  }

  /**
   * Join Conversation Room
   */
  @SubscribeMessage('join')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      const userId = client.data.userId;
      const { conversationId } = data;

      if (!conversationId) {
        return { success: false, message: 'conversationId is required' };
      }

      // Join Socket.IO room
      client.join(conversationId);

      // Update Redis state
      await this.socketRoomService.joinRoom(userId, conversationId);

      // Get room users
      const roomUsers = await this.socketRoomService.getRoomUsers(conversationId);

      this.logger.log(
        `👥 Room ${conversationId} has ${roomUsers.length} users: ${roomUsers.join(', ')}`,
      );

      // Notify others in the chat
      client.to(conversationId).emit('user-joined-chat', {
        userId,
        userName: client.data.user?.name,
        conversationId,
        isOnline: true,
      });

      return {
        success: true,
        message: 'Joined conversation successfully',
        roomUsers,
      };
    } catch (error) {
      this.logger.error(`❌ Join room error: ${error.message}`);
      return { success: false, message: 'Failed to join room' };
    }
  }

  /**
   * Leave Conversation Room
   */
  @SubscribeMessage('leave')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      const userId = client.data.userId;
      const { conversationId } = data;

      if (!conversationId) {
        return { success: false, message: 'conversationId is required' };
      }

      // Leave Socket.IO room
      client.leave(conversationId);

      // Update Redis state
      await this.socketRoomService.leaveRoom(userId, conversationId);

      // Notify others
      client.to(conversationId).emit('user-left-chat', {
        userId,
        userName: client.data.user?.name,
        conversationId,
      });

      return { success: true, message: 'Left conversation successfully' };
    } catch (error) {
      this.logger.error(`❌ Leave room error: ${error.message}`);
      return { success: false, message: 'Failed to leave room' };
    }
  }

  /**
   * Join Task Room
   */
  @SubscribeMessage('join-task')
  async handleJoinTaskRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { taskId: string },
  ) {
    try {
      const userId = client.data.userId;
      const { taskId } = data;

      if (!taskId) {
        return { success: false, message: 'taskId is required' };
      }

      // Join Socket.IO room
      client.join(taskId);

      // Update Redis state
      await this.socketRoomService.joinTaskRoom(userId, taskId);

      // Get task room users
      const roomUsers = await this.socketRoomService.getTaskRoomUsers(taskId);

      this.logger.log(
        `📋 Task room ${taskId} has ${roomUsers.length} users`,
      );

      // Notify others in the task
      client.to(taskId).emit('user-joined-task', {
        userId,
        userName: client.data.user?.name,
        taskId,
        isOnline: true,
      });

      return { success: true, message: 'Joined task room successfully' };
    } catch (error) {
      this.logger.error(`❌ Join task room error: ${error.message}`);
      return { success: false, message: 'Failed to join task room' };
    }
  }

  /**
   * Leave Task Room
   */
  @SubscribeMessage('leave-task')
  async handleLeaveTaskRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { taskId: string },
  ) {
    try {
      const userId = client.data.userId;
      const { taskId } = data;

      if (!taskId) {
        return { success: false, message: 'taskId is required' };
      }

      // Leave Socket.IO room
      client.leave(taskId);

      // Update Redis state
      await this.socketRoomService.leaveTaskRoom(userId, taskId);

      // Notify others
      client.to(taskId).emit('user-left-task', {
        userId,
        userName: client.data.user?.name,
        taskId,
      });

      return { success: true, message: 'Left task room successfully' };
    } catch (error) {
      this.logger.error(`❌ Leave task room error: ${error.message}`);
      return { success: false, message: 'Failed to leave task room' };
    }
  }

  /**
   * Get Related Online Users
   */
  @SubscribeMessage('only-related-online-users')
  async handleGetRelatedOnlineUsers(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    try {
      const relatedOnlineUsers = await this.socketAuthService.getRelatedOnlineUsers(
        data.userId,
      );

      this.logger.log(
        `📊 Related online users for ${data.userId}: ${relatedOnlineUsers.length}`,
      );

      return {
        success: true,
        data: relatedOnlineUsers,
      };
    } catch (error) {
      this.logger.error(`❌ Get related online users error: ${error.message}`);
      return {
        success: false,
        message: 'Failed to fetch related online users',
      };
    }
  }

  /**
   * Get Family Activity Feed
   */
  @SubscribeMessage('get-family-activity-feed')
  async handleGetFamilyActivityFeed(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { businessUserId: string; limit?: number },
  ) {
    try {
      const limit = data.limit || 10;
      const activities = await this.socketRoomService.getActivityFeed(
        data.businessUserId,
        limit,
      );

      return {
        success: true,
        data: activities,
      };
    } catch (error) {
      this.logger.error(`❌ Get family activity feed error: ${error.message}`);
      return {
        success: false,
        message: 'Failed to fetch activity feed',
      };
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // NOTIFICATION EMISSION METHODS
  // Called from NotificationService to emit real-time notifications
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Emit Notification to User
   * 
   * @param userId - User ID
   * @param notification - Notification data
   */
  async emitNotificationToUser(userId: string, notification: any): Promise<boolean> {
    try {
      const eventName = `notification::${userId}`;
      
      this.server.to(userId).emit(eventName, notification);
      
      this.logger.log(`🔔 Notification sent to user ${userId}`);
      
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to emit notification: ${error.message}`);
      return false;
    }
  }

  /**
   * Emit Unread Count Update to User
   * 
   * @param userId - User ID
   * @param count - Unread count
   */
  async emitUnreadCountUpdate(userId: string, count: number): Promise<void> {
    try {
      const eventName = `notification:unread-count::${userId}`;
      
      this.server.to(userId).emit(eventName, { count, hasUnread: count > 0 });
      
      this.logger.debug(`📊 Unread count update sent to user ${userId}: ${count}`);
    } catch (error) {
      this.logger.error(`❌ Failed to emit unread count: ${error.message}`);
    }
  }

  /**
   * Broadcast to Role
   * 
   * @param role - Role name
   * @param event - Event name
   * @param data - Data to emit
   */
  async broadcastToRole(role: string, event: string, data: any): Promise<void> {
    try {
      const roomName = `role::${role}`;
      
      this.server.to(roomName).emit(event, data);
      
      this.logger.log(`📢 Broadcast to role ${role}: ${event}`);
    } catch (error) {
      this.logger.error(`❌ Failed to broadcast to role: ${error.message}`);
    }
  }

  /**
   * Check if User is Online
   * 
   * @param userId - User ID
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const sockets = await this.server.in(userId).fetchSockets();
    return sockets.length > 0;
  }

  /**
   * Emit to User
   * 
   * @param userId - User ID
   * @param event - Event name
   * @param data - Data to emit
   */
  async emitToUser(userId: string, event: string, data: any): Promise<boolean> {
    try {
      this.server.to(userId).emit(event, data);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to emit to user: ${error.message}`);
      return false;
    }
  }

  /**
   * Emit to Room
   *
   * @param roomId - Room ID
   * @param event - Event name
   * @param data - Data to emit
   */
  async emitToRoom(roomId: string, event: string, data: any): Promise<boolean> {
    try {
      this.server.to(roomId).emit(event, data);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to emit to room: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if member is in room
   *
   * @param userId - User ID
   * @param roomId - Room ID
   */
  async isMemberInRoom(userId: string, roomId: string): Promise<boolean> {
    try {
      return await this.socketRoomService.isUserInRoom(userId, roomId);
    } catch (error) {
      this.logger.error(`❌ Failed to check if member is in room: ${error.message}`);
      return false;
    }
  }
}
