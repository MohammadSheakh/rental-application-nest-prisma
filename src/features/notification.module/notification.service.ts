import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { Notification, NotificationDocument, NotificationType, NotificationStatus, NotificationPriority } from './notification.schema';
import { SendNotificationDto, EnqueueNotificationDto, BroadcastNotificationDto } from './dto/notification.dto';
import { REDIS_CLIENT } from '../../helpers/redis/redis.module';
import { BULLMQ_NOTIFICATION_QUEUE, QUEUE_NAMES } from '../../helpers/bullmq/bullmq.constants';
import { SocketGateway } from '../socket.gateway/socket.gateway';

/**
 * Notification Service
 *
 * 📚 GENERIC NOTIFICATION SYSTEM
 *
 * Features:
 * - Send notifications from any module (tasks, chat, subscriptions, etc.)
 * - Real-time Socket.IO delivery
 * - Async BullMQ processing
 * - Broadcast to users/roles
 * - Redis caching for unread counts
 *
 * Usage:
 * ```typescript
 * // From any module
 * constructor(private notificationService: NotificationService) {}
 *
 * // Send notification
 * await this.notificationService.sendNotification({
 *   title: 'New Task',
 *   senderId: userId,
 *   receiverId: assigneeId,
 *   type: NotificationType.ASSIGNMENT,
 *   entityType: 'task',
 *   entityId: taskId,
 * });
 *
 * // Enqueue notification (async)
 * await this.notificationService.enqueueNotification({
 *   title: 'Reminder',
 *   receiverId: userId,
 *   type: NotificationType.REMINDER,
 * });
 * ```
 *
 * Compatible with Express.js notification.service.js
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly notificationQueue: Queue;

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @Inject(REDIS_CLIENT) private redisClient: Redis,
    @Inject(BULLMQ_NOTIFICATION_QUEUE) notificationQueue: Queue,
    private socketGateway: SocketGateway,
  ) {
    this.notificationQueue = notificationQueue;
  }

  /**
   * Send notification (synchronous)
   *
   * Creates notification in DB and emits via Socket.IO
   *
   * @param dto - Notification data
   * @returns Created notification
   */
  async sendNotification(dto: SendNotificationDto): Promise<NotificationDocument> {
    try {
      // Create notification in DB
      const notification = await this.notificationModel.create({
        ...dto,
        senderId: dto.senderId ? new Types.ObjectId(dto.senderId) : undefined,
        receiverId: dto.receiverId ? new Types.ObjectId(dto.receiverId) : undefined,
        entityId: dto.entityId ? new Types.ObjectId(dto.entityId) : undefined,
        linkId: dto.linkId ? new Types.ObjectId(dto.linkId) : undefined,
        status: NotificationStatus.SENT,
        isRead: false,
      });

      this.logger.log(`✅ Notification created: ${notification._id}`);

      // Emit via Socket.IO (real-time)
      await this.emitNotification(notification);

      // Update unread count cache
      if (dto.receiverId) {
        await this.incrementUnreadCount(dto.receiverId);
      }

      return notification;
    } catch (error) {
      this.logger.error(`❌ Failed to send notification: ${error.message}`);
      throw error;
    }
  }

  /**
   * Enqueue notification (async via BullMQ)
   *
   * Queues notification for async processing
   *
   * @param dto - Notification data
   * @param delay - Delay in milliseconds
   */
  async enqueueNotification(dto: EnqueueNotificationDto, delay?: number): Promise<void> {
    try {
      const jobId = `notif:${dto.receiverId || 'broadcast'}:${Date.now()}`;

      await this.notificationQueue.add(
        'send-notification',
        dto,
        {
          jobId,
          delay: delay || dto.delay || 0,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      );

      this.logger.log(`📬 Notification enqueued: ${jobId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to enqueue notification: ${error.message}`);
      throw error;
    }
  }

  /**
   * Broadcast notification to multiple users
   *
   * @param dto - Broadcast notification data
   */
  async broadcastNotification(dto: BroadcastNotificationDto): Promise<void> {
    try {
      const notifications: NotificationDocument[] = [];

      // Broadcast to specific users
      if (dto.receiverIds && dto.receiverIds.length > 0) {
        for (const receiverId of dto.receiverIds) {
          const notification = await this.sendNotification({
            ...dto,
            receiverId,
          });
          notifications.push(notification);
        }
      }

      // Broadcast to role
      if (dto.broadcastToRole) {
        await this.socketGateway.broadcastToRole(dto.broadcastToRole, 'notification::broadcast', {
          title: dto.title,
          type: dto.type,
          senderId: dto.senderId,
        });
        this.logger.log(`📢 Broadcasted to role: ${dto.broadcastToRole}`);
      }

      // Broadcast to all users
      if (dto.broadcastToAll) {
        // TODO: Get all users and send notification
        this.logger.log(`📢 Broadcasting to all users`);
      }

      this.logger.log(`✅ Broadcasted notification to ${notifications.length} users`);
    } catch (error) {
      this.logger.error(`❌ Failed to broadcast notification: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user's notifications
   *
   * @param userId - User ID
   * @param page - Page number
   * @param limit - Items per page
   * @param isRead - Filter by read status
   */
  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    isRead?: boolean,
  ): Promise<{ notifications: NotificationDocument[]; total: number }> {
    const skip = (page - 1) * limit;

    const query: any = {
      receiverId: new Types.ObjectId(userId),
      isDeleted: false,
    };

    if (isRead !== undefined) {
      query.isRead = isRead;
    }

    const [notifications, total] = await Promise.all([
      this.notificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderId', 'name profileImage')
        .lean()
        .exec(),
      this.notificationModel.countDocuments(query),
    ]);

    return { notifications, total };
  }

  /**
   * Get unread notification count
   *
   * @param userId - User ID
   */
  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = `notification:unread:${userId}`;

    // Try cache first
    const cached = await this.redisClient.get(cacheKey);
    if (cached) {
      return parseInt(cached, 10);
    }

    // Query DB
    const count = await this.notificationModel.countDocuments({
      receiverId: new Types.ObjectId(userId),
      isRead: false,
      isDeleted: false,
    });

    // Cache for 5 minutes
    await this.redisClient.setEx(cacheKey, 300, count.toString());

    return count;
  }

  /**
   * Mark notification as read
   *
   * @param notificationId - Notification ID
   * @param userId - User ID (for validation)
   */
  async markAsRead(notificationId: string, userId: string): Promise<NotificationDocument | null> {
    const notification = await this.notificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        receiverId: new Types.ObjectId(userId),
      },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true },
    ).exec();

    if (notification) {
      // Update unread count cache
      await this.decrementUnreadCount(userId);
    }

    return notification;
  }

  /**
   * Mark all notifications as read
   *
   * @param userId - User ID
   */
  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    const result = await this.notificationModel.updateMany(
      {
        receiverId: new Types.ObjectId(userId),
        isRead: false,
        isDeleted: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    ).exec();

    // Clear unread count cache
    await this.redisClient.del(`notification:unread:${userId}`);

    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Delete notification
   *
   * @param notificationId - Notification ID
   * @param userId - User ID (for validation)
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    await this.notificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        receiverId: new Types.ObjectId(userId),
      },
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
    ).exec();

    // Update unread count cache
    await this.decrementUnreadCount(userId);
  }

  /**
   * Emit notification via Socket.IO
   *
   * @param notification - Notification document
   */
  private async emitNotification(notification: NotificationDocument): Promise<void> {
    try {
      const notificationData = {
        _id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        senderId: notification.senderId,
        receiverId: notification.receiverId,
        receiverRole: notification.receiverRole,
        linkFor: notification.linkFor,
        linkId: notification.linkId,
        referenceFor: notification.referenceFor,
        referenceId: notification.referenceId,
        createdAt: notification.createdAt,
      };

      // Emit to admin role or specific user
      if (notification.receiverRole === 'admin') {
        await this.socketGateway.broadcastToRole('admin', 'notification::admin', notificationData);
        this.logger.log(`🔔 Notification broadcasted to admin role`);
      } else if (notification.receiverId) {
        const emitted = await this.socketGateway.emitNotificationToUser(
          notification.receiverId.toString(),
          notificationData,
        );

        if (emitted) {
          this.logger.log(`🔔 Notification sent to user ${notification.receiverId}`);
        } else {
          this.logger.log(`📴 User ${notification.receiverId} is offline, notification saved in DB only`);
        }
      }
    } catch (error) {
      this.logger.error(`❌ Failed to emit notification: ${error.message}`);
    }
  }

  /**
   * Increment unread count cache
   *
   * @param userId - User ID
   */
  private async incrementUnreadCount(userId: string): Promise<void> {
    const cacheKey = `notification:unread:${userId}`;
    await this.redisClient.incr(cacheKey);
    await this.redisClient.expire(cacheKey, 300);
  }

  /**
   * Decrement unread count cache
   *
   * @param userId - User ID
   */
  private async decrementUnreadCount(userId: string): Promise<void> {
    const cacheKey = `notification:unread:${userId}`;
    await this.redisClient.decr(cacheKey);
    await this.redisClient.expire(cacheKey, 300);
  }
}
