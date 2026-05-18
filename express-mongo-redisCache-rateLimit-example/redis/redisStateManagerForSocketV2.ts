// src/helpers/redis/RedisStateManager.ts
// ────────────────────────────────────────────────────────────────────────────────
// Redis State Manager for Socket.IO
// ────────────────────────────────────────────────────────────────────────────────
// Purpose: Manages real-time state for Socket.IO connections using Redis
// Features:
//   - Online user tracking
//   - Room management (chat, tasks, groups)
//   - User presence and status
//   - Distributed state across multiple workers
//
// Used by:
//   - Chat module (conversation rooms)
//   - Task module (task rooms, group activities)
//   - Notification module (real-time notifications)
//   - Group module (via childrenBusinessUser)
//
// Architecture:
//   All keys are prefixed with 'chat:' for backward compatibility
//   New room types use the same underlying Redis data structures
//
// @version 2.0.0
// @author Senior Engineering Team
// ────────────────────────────────────────────────────────────────────────────────

//@ts-ignore
import { RedisClientType } from 'redis';
//@ts-ignore
import colors from 'colors';
import { logger } from '../../shared/logger';
import { IUserProfile } from '../socket/socketForChatV3';
import { ConversationParticipentsService } from '../../modules/chatting.module/conversationParticipents/conversationParticipents.service';

interface UserConnectionInfo {
  socketId: string;
  workerId: string;
  connectedAt: number;
  userInfo?: IUserProfile;
}

const conversationParticipentsService = new ConversationParticipentsService();

/**
 * Redis Key Configuration
 * All keys use consistent naming for easy debugging and maintenance
 */
export class RedisStateManager {
  private redis: RedisClientType;
  private readonly KEYS = {
    // Online user tracking
    ONLINE_USERS: 'chat:online_users',              // Set of online userIds
    USER_SOCKET_MAP: 'chat:user_socket_map:',       // Hash: userId -> connection info
    SOCKET_USER_MAP: 'chat:socket_user_map:',       // Hash: socketId -> userId
    USER_STATUS: 'chat:user_status:',               // Hash: userId -> status

    // Room management (generic - works for chat, tasks, groups)
    USER_ROOMS: 'chat:user_rooms:',                 // Set: userId's joined rooms
    ROOM_USERS: 'chat:room_users:',                 // Set: room's connected users

    // Task-specific rooms (NEW - for task management)
    TASK_ROOMS: 'task:rooms:',                      // Set: taskId -> connected users
    USER_TASKS: 'task:user_tasks:',                 // Set: userId -> subscribed tasks

    // Group-specific rooms (NEW - for childrenBusinessUser group activities)
    GROUP_ROOMS: 'group:rooms:',                    // Set: groupId/businessUserId -> connected users
    USER_GROUPS: 'group:user_groups:',              // Set: userId -> subscribed groups

    // Activity feed tracking
    ACTIVITY_FEED: 'activity:feed:',                // List: groupId -> recent activities
  };

  constructor(redisClient: RedisClientType) {
    this.redis = redisClient;
  }

  // =============================================
  // Online Users Management
  // =============================================

  // 🔗➡️ socketForChatV3.ts -> setupEventHandlers
  async handleUserReconnection(
    userId: string,
    newSocketId: string,
    workerId: string,
    userInfo?: IUserProfile
  ): Promise<string | null> {
    const existingInfo = await this.getUserConnectionInfo(userId);

    if (existingInfo && existingInfo.socketId !== newSocketId) {
      logger.info(
        colors.yellow(
          `🔄 User ${userId} reconnecting. Old socket: ${existingInfo.socketId}, New socket: ${newSocketId}`
        )
      );

      // Clean up old socket mapping
      await this.redis.del(`${this.KEYS.SOCKET_USER_MAP}${existingInfo.socketId}`);

      // Return old socket ID so caller can disconnect it
      return existingInfo.socketId;
    }

    // Add new connection
    await this.addOnlineUser(userId, newSocketId, workerId, userInfo);
    return null;
  }

  // 🔗➡️ handleUserReconnection
  async addOnlineUser(userId: string, socketId: string, workerId: string, userInfo?: IUserProfile): Promise<void> {
    // Validate types
    if (typeof userId !== 'string') {
      logger.error('❌ userId is not a string:', { type: typeof userId, value: userId });
      throw new Error('userId must be a string');
    }
    if (typeof socketId !== 'string') {
      logger.error('❌ socketId is not a string:', { type: typeof socketId, value: socketId });
      throw new Error('socketId must be a string');
    }

    const pipeline = this.redis.multi(); // Use .multi() for transactions in redis v4+

    // Adds the user to the online users set.
    pipeline.sAdd(this.KEYS.ONLINE_USERS, userId);

    // Store user-socket mapping
    pipeline.hSet(
      `${this.KEYS.USER_SOCKET_MAP}${userId}`,
      {
        socketId,
        workerId,
        connectedAt: Date.now().toString(),
        userInfo: JSON.stringify(userInfo || {}),
      }
    );

    // Store socket-user mapping
    pipeline.hSet(`${this.KEYS.SOCKET_USER_MAP}${socketId}`, { userId });

    // Set user status
    pipeline.hSet(
      `${this.KEYS.USER_STATUS}${userId}`,
      {
        isOnline: 'true',
        lastSeen: Date.now().toString(),
        workerId,
      }
    );

    await pipeline.exec();

    logger.info(colors.green(`✅ User ${userId} added to Redis state (Worker: ${workerId})`));
  }

  // 🔗➡️ cleanupStaleConnections
  async removeOnlineUser(userId: string, socketId: string): Promise<void> {
    const pipeline = this.redis.multi();

    // Remove from online users set
    pipeline.sRem(this.KEYS.ONLINE_USERS, userId);

    // Remove user-socket mapping
    pipeline.del(`${this.KEYS.USER_SOCKET_MAP}${userId}`);

    // Remove socket-user mapping
    pipeline.del(`${this.KEYS.SOCKET_USER_MAP}${socketId}`);

    // Update user status to offline
    pipeline.hSet(
      `${this.KEYS.USER_STATUS}${userId}`,
      {
        isOnline: 'false',
        lastSeen: Date.now().toString(),
      }
    );

    // Remove user from all rooms (chat, task, group)
    await this.removeUserFromAllRooms(userId);
    await this.removeUserFromAllTaskRooms(userId);
    await this.removeUserFromAllGroupRooms(userId);

    await pipeline.exec();

    logger.info(colors.red(`❌ User ${userId} removed from Redis state`));
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const isMember = await this.redis.sIsMember(this.KEYS.ONLINE_USERS, userId);
    return isMember;
  }


  async getAllOnlineUsers(): Promise<string[]> {
    return await this.redis.sMembers(this.KEYS.ONLINE_USERS);
  }

  // 🔗➡️ getSystemStats
  async getOnlineUsersCount(): Promise<number> {
    return await this.redis.sCard(this.KEYS.ONLINE_USERS);
  }

  // 🔗➡️ cleanupStaleConnections || handleUserReconnection
  async getUserConnectionInfo(userId: string): Promise<UserConnectionInfo | null> {
    const info = await this.redis.hGetAll(`${this.KEYS.USER_SOCKET_MAP}${userId}`);

    // hGetAll returns {} if key doesn't exist
    if (!info || Object.keys(info).length === 0) return null;

    return {
      socketId: info.socketId,
      workerId: info.workerId,
      connectedAt: parseInt(info.connectedAt, 10),
      userInfo: info.userInfo ? JSON.parse(info.userInfo) : undefined,
    };
  }

  async getUserBySocketId(socketId: string): Promise<string | null> {
    const userId = await this.redis.hGet(`${this.KEYS.SOCKET_USER_MAP}${socketId}`, 'userId');
    return userId; // string or null
  }

  // =============================================
  // Room Management
  // =============================================

  async joinRoom(userId: string, roomId: string): Promise<void> {
    const pipeline = this.redis.multi();

    // Add room to user's rooms
    pipeline.sAdd(`${this.KEYS.USER_ROOMS}${userId}`, roomId);

    // Add user to room's users
    pipeline.sAdd(`${this.KEYS.ROOM_USERS}${roomId}`, userId);

    await pipeline.exec();

    logger.info(`👥 User ${userId} joined room ${roomId}`);
  }

  async leaveRoom(userId: string, roomId: string): Promise<void> {
    const pipeline = this.redis.multi();

    // Remove room from user's rooms
    pipeline.sRem(`${this.KEYS.USER_ROOMS}${userId}`, roomId);

    // Remove user from room's users
    pipeline.sRem(`${this.KEYS.ROOM_USERS}${roomId}`, userId);

    await pipeline.exec();

    logger.info(`👥 User ${userId} left room ${roomId}`);
  }

  async getRoomUsers(roomId: string): Promise<string[]> {
    return await this.redis.sMembers(`${this.KEYS.ROOM_USERS}${roomId}`);
  }

  // this method add for handle push notification
  // here roomId means conversationId
  async isUserInRoom(userId: string, roomId: string): Promise<boolean> {
    return await this.redis.sIsMember(`${this.KEYS.ROOM_USERS}${roomId}`, userId);
  }


  async getUserRooms(userId: string): Promise<string[]> {
    return await this.redis.sMembers(`${this.KEYS.USER_ROOMS}${userId}`);
  }

  async removeUserFromAllRooms(userId: string): Promise<void> {
    const userRooms = await this.getUserRooms(userId);

    if (userRooms.length === 0) return;

    const pipeline = this.redis.multi();

    // Remove user from all their rooms
    for (const roomId of userRooms) {
      pipeline.sRem(`${this.KEYS.ROOM_USERS}${roomId}`, userId);
    }

    // Clear user's rooms list
    pipeline.del(`${this.KEYS.USER_ROOMS}${userId}`);

    await pipeline.exec();

    logger.info(`🧹 Removed user ${userId} from ${userRooms.length} rooms`);
  }

  // =============================================
  // Task Room Management (NEW)
  // For real-time task updates and collaboration
  // =============================================

  /**
   * Join user to a task room
   * Used when user wants to receive real-time updates for a specific task
   *
   * @param userId - User ID
   * @param taskId - Task ID
   */
  async joinTaskRoom(userId: string, taskId: string): Promise<void> {
    const pipeline = this.redis.multi();

    // Add task to user's subscribed tasks
    pipeline.sAdd(`${this.KEYS.USER_TASKS}${userId}`, taskId);

    // Add user to task's connected users
    pipeline.sAdd(`${this.KEYS.TASK_ROOMS}${taskId}`, userId);

    await pipeline.exec();

    logger.info(`📋 User ${userId} joined task room ${taskId}`);
  }

  /**
   * Leave user from a task room
   * Used when user no longer needs task updates
   *
   * @param userId - User ID
   * @param taskId - Task ID
   */
  async leaveTaskRoom(userId: string, taskId: string): Promise<void> {
    const pipeline = this.redis.multi();

    // Remove task from user's subscribed tasks
    pipeline.sRem(`${this.KEYS.USER_TASKS}${userId}`, taskId);

    // Remove user from task's connected users
    pipeline.sRem(`${this.KEYS.TASK_ROOMS}${taskId}`, userId);

    await pipeline.exec();

    logger.info(`📋 User ${userId} left task room ${taskId}`);
  }

  /**
   * Get all users subscribed to a task
   * Used to broadcast task updates
   *
   * @param taskId - Task ID
   * @returns Array of user IDs
   */
  async getTaskRoomUsers(taskId: string): Promise<string[]> {
    return await this.redis.sMembers(`${this.KEYS.TASK_ROOMS}${taskId}`);
  }

  /**
   * Check if user is subscribed to a task
   *
   * @param userId - User ID
   * @param taskId - Task ID
   * @returns true if subscribed
   */
  async isUserInTaskRoom(userId: string, taskId: string): Promise<boolean> {
    return await this.redis.sIsMember(`${this.KEYS.USER_TASKS}${userId}`, taskId);
  }

  /**
   * Get all tasks a user is subscribed to
   *
   * @param userId - User ID
   * @returns Array of task IDs
   */
  async getUserTaskRooms(userId: string): Promise<string[]> {
    return await this.redis.sMembers(`${this.KEYS.USER_TASKS}${userId}`);
  }

  /**
   * Remove user from all task rooms
   * Called on user disconnect
   *
   * @param userId - User ID
   */
  async removeUserFromAllTaskRooms(userId: string): Promise<void> {
    const userTaskRooms = await this.getUserTaskRooms(userId);

    if (userTaskRooms.length === 0) return;

    const pipeline = this.redis.multi();

    // Remove user from all task rooms
    for (const taskId of userTaskRooms) {
      pipeline.sRem(`${this.KEYS.TASK_ROOMS}${taskId}`, userId);
    }

    // Clear user's task rooms list
    pipeline.del(`${this.KEYS.USER_TASKS}${userId}`);

    await pipeline.exec();

    logger.info(`🧹 Removed user ${userId} from ${userTaskRooms.length} task rooms`);
  }

  // =============================================
  // Group Room Management (NEW)
  // For real-time group/family activities via childrenBusinessUser
  // =============================================

  /**
   * Join user to a group room
   * Used for family/team group real-time updates
   * Note: groupId here refers to businessUserId for family groups
   *
   * @param userId - User ID
   * @param groupId - Group ID (businessUserId for family groups)
   */
  async joinGroupRoom(userId: string, groupId: string): Promise<void> {
    const pipeline = this.redis.multi();

    // Add group to user's subscribed groups
    pipeline.sAdd(`${this.KEYS.USER_GROUPS}${userId}`, groupId);

    // Add user to group's connected users
    pipeline.sAdd(`${this.KEYS.GROUP_ROOMS}${groupId}`, userId);

    await pipeline.exec();

    logger.info(`👨‍👩‍👧‍👦 User ${userId} joined group room ${groupId}`);
  }

  /**
   * Leave user from a group room
   *
   * @param userId - User ID
   * @param groupId - Group ID
   */
  async leaveGroupRoom(userId: string, groupId: string): Promise<void> {
    const pipeline = this.redis.multi();

    // Remove group from user's subscribed groups
    pipeline.sRem(`${this.KEYS.USER_GROUPS}${userId}`, groupId);

    // Remove user from group's connected users
    pipeline.sRem(`${this.KEYS.GROUP_ROOMS}${groupId}`, userId);

    await pipeline.exec();

    logger.info(`👨‍👩‍👧‍👦 User ${userId} left group room ${groupId}`);
  }

  /**
   * Get all users in a group
   * Used to broadcast group activities
   *
   * @param groupId - Group ID
   * @returns Array of user IDs
   */
  async getGroupRoomUsers(groupId: string): Promise<string[]> {
    return await this.redis.sMembers(`${this.KEYS.GROUP_ROOMS}${groupId}`);
  }

  /**
   * Check if user is in a group room
   *
   * @param userId - User ID
   * @param groupId - Group ID
   * @returns true if in group
   */
  async isUserInGroupRoom(userId: string, groupId: string): Promise<boolean> {
    return await this.redis.sIsMember(`${this.KEYS.USER_GROUPS}${userId}`, groupId);
  }

  /**
   * Get all groups a user is subscribed to
   *
   * @param userId - User ID
   * @returns Array of group IDs
   */
  async getUserGroupRooms(userId: string): Promise<string[]> {
    return await this.redis.sMembers(`${this.KEYS.USER_GROUPS}${userId}`);
  }

  /**
   * Remove user from all group rooms
   * Called on user disconnect
   *
   * @param userId - User ID
   */
  async removeUserFromAllGroupRooms(userId: string): Promise<void> {
    const userGroupRooms = await this.getUserGroupRooms(userId);

    if (userGroupRooms.length === 0) return;

    const pipeline = this.redis.multi();

    // Remove user from all group rooms
    for (const groupId of userGroupRooms) {
      pipeline.sRem(`${this.KEYS.GROUP_ROOMS}${groupId}`, userId);
    }

    // Clear user's group rooms list
    pipeline.del(`${this.KEYS.USER_GROUPS}${userId}`);

    await pipeline.exec();

    logger.info(`🧹 Removed user ${userId} from ${userGroupRooms.length} group rooms`);
  }

  // =============================================
  // Activity Feed Management (NEW)
  // For storing and retrieving recent group activities
  // =============================================

  /**
   * Add activity to group's activity feed
   * Activities are stored as JSON strings in a Redis list
   *
   * @param groupId - Group ID
   * @param activity - Activity data
   * @param maxActivities - Maximum activities to keep (default: 50)
   */
  async addActivityToFeed(groupId: string, activity: any, maxActivities: number = 50): Promise<void> {
    const activityKey = `${this.KEYS.ACTIVITY_FEED}${groupId}`;

    // Add activity to beginning of list
    await this.redis.lPush(activityKey, JSON.stringify(activity));

    // Trim list to keep only recent activities
    await this.redis.lTrim(activityKey, 0, maxActivities - 1);

    // Set TTL to auto-expire old activity feeds (7 days)
    await this.redis.expire(activityKey, 7 * 24 * 60 * 60);

    logger.info(`📢 Added activity to group ${groupId} feed`);
  }

  /**
   * Get recent activities for a group
   *
   * @param groupId - Group ID
   * @param limit - Number of activities to return (default: 10)
   * @returns Array of activities
   */
  async getActivityFeed(groupId: string, limit: number = 10): Promise<any[]> {
    const activityKey = `${this.KEYS.ACTIVITY_FEED}${groupId}`;

    const activities = await this.redis.lRange(activityKey, 0, limit - 1);

    return activities.map(activity => JSON.parse(activity));
  }

  /**
   * Clear activity feed for a group
   *
   * @param groupId - Group ID
   */
  async clearActivityFeed(groupId: string): Promise<void> {
    const activityKey = `${this.KEYS.ACTIVITY_FEED}${groupId}`;
    await this.redis.del(activityKey);

    logger.info(`🧹 Cleared activity feed for group ${groupId}`);
  }

  // =============================================
  // Related Users
  // =============================================

  //🔗➡️ socketForChatV3.ts -> notifyRelatedUsersOnlineStatus
  // 🔗➡️ socketForChatV3.ts ->  setupUserEventHandlers -> socket.on('only-related-online-users'
  async getRelatedOnlineUsers(userId: string): Promise<string[]> {
    try {
      const allOnlineUsers = await this.getAllOnlineUsers();

    //🔎 need to check these codes 
      const usersWithConversations = await conversationParticipentsService
        .getAllConversationsOnlyPersonInformationByUserId(userId);

      const relatedOnlineUsers = allOnlineUsers.filter((onlineUserId) =>
        usersWithConversations.some(
          (conversationUser: any) =>
            conversationUser?._id?.toString() === onlineUserId ||
            conversationUser?.toString() === onlineUserId
        )
      );

      return relatedOnlineUsers;
    } catch (error) {
      logger.error('Error getting related online users:', error);
      return [];
    }
  }

  // =============================================
  // Cleanup & Maintenance
  // =============================================

  // 🔗➡️ socketForChatV3.ts -> startCleanupJob
  async cleanupStaleConnections(): Promise<void> {
    const onlineUsers = await this.getAllOnlineUsers();
    const staleThreshold = Date.now() - 5 * 60 * 1000; // 5 minutes

    for (const userId of onlineUsers) {
      const connectionInfo = await this.getUserConnectionInfo(userId);

      if (connectionInfo && connectionInfo.connectedAt < staleThreshold) {
        logger.warn(`🧹 Cleaning up stale connection for user ${userId}`);
        await this.removeOnlineUser(userId, connectionInfo.socketId);
      }
    }
  }

  // 🔗➡️ socketForChatV3.ts -> getSystemStats
  async getSystemStats(): Promise<any> {
    return {
      totalOnlineUsers: await this.getOnlineUsersCount(),
      onlineUsers: await this.getAllOnlineUsers(),
      timestamp: Date.now(),
    };
  }

  async setUserDataTTL(userId: string, ttlSeconds: number = 86400): Promise<void> {
    const pipeline = this.redis.multi();

    pipeline.expire(`${this.KEYS.USER_SOCKET_MAP}${userId}`, ttlSeconds);
    pipeline.expire(`${this.KEYS.USER_STATUS}${userId}`, ttlSeconds);
    pipeline.expire(`${this.KEYS.USER_ROOMS}${userId}`, ttlSeconds);

    await pipeline.exec();
  }
}