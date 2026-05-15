//@ts-ignore
import { StatusCodes } from 'http-status-codes';
import { Task } from './task.model';
import { ITask } from './task.interface';
import { GenericService } from '../../_generic-module/generic.services';
import ApiError from '../../../errors/ApiError';
//@ts-ignore
import { Types } from 'mongoose';
import {
  TaskStatus,
  TASK_CACHE_CONFIG,
  TTaskStatus,
  DAILY_TASK_LIMIT,
} from './task.constant';
import { redisClient } from '../../../helpers/redis/redis';
import { logger, errorLogger } from '../../../shared/logger';
import { NotificationService } from '../../notification.module/notification/notification.service';
import { ACTIVITY_TYPE } from '../../notification.module/notification/notification.constant';
import { TaskProgressService } from '../../taskProgress.module/taskProgress.service';
import { socketService } from '../../../helpers/socket/socketForChatV3';

const notificationService = new NotificationService();
const taskProgressService = new TaskProgressService();

/**
 * Task Service
 * Handles business logic for task operations
 * Extends GenericService for CRUD operations
 *
 * Features:
 * - Redis caching for read operations
 * - Automatic cache invalidation on writes
 * - Daily task limit validation
 */
export class TaskService extends GenericService<typeof Task, ITask> {
  constructor() {
    super(Task);
  }

  /**✔️
   * Cache Key Generator
   */
  private getCacheKey(type: string, id?: string, userId?: string): string {
    const prefix = TASK_CACHE_CONFIG.PREFIX;

    if (type === 'detail' && id) {
      return `${prefix}:detail:${id}`;
    }
    if (type === 'list' && userId) {
      return `${prefix}:user:${userId}:list`;
    }
    if (type === 'statistics' && userId) {
      return `${prefix}:user:${userId}:statistics`;
    }
    if (type === 'daily-progress' && userId) {
      return `${prefix}:user:${userId}:daily:${id || 'today'}`;
    }
    return `${prefix}:unknown`;
  }

  /** ✔️
   * Get from Cache
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        logger.debug(`Cache hit: ${key}`);
        return JSON.parse(cachedData) as T;
      }
      logger.debug(`Cache miss: ${key}`);
      return null;
    } catch (error) {
      errorLogger.error('Redis GET error in TaskService:', error);
      return null;
    }
  }

  /** ✔️
   * Set in Cache
   */
  private async setInCache<T>(
    key: string,
    data: T,
    ttl: number,
  ): Promise<void> {
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(data));
      logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      errorLogger.error('Redis SET error in TaskService:', error);
    }
  }

  /** 🔁
   * Invalidate Cache
   */
  private async invalidateCache(
    userId: string,
    taskId?: string,
  ): Promise<void> {
    try {
      const keysToDelete = [
        this.getCacheKey('list', undefined, userId),
        this.getCacheKey('statistics', undefined, userId),
      ];

      if (taskId) {
        keysToDelete.push(this.getCacheKey('detail', taskId));
        keysToDelete.push(this.getCacheKey('daily-progress', taskId, userId));
      }

      // Add pattern-based invalidation
      Object.values(TASK_CACHE_CONFIG.INVALIDATION_PATTERNS).forEach(
        patterns => {
          patterns.forEach(pattern => {
            if (pattern.includes('*') && taskId) {
              keysToDelete.push(pattern.replace('*', taskId));
            }
          });
        },
      );

      if (keysToDelete.length > 0) {
        await redisClient.del(keysToDelete);
        logger.info(
          `Invalidated ${keysToDelete.length} cache keys for user ${userId}`,
        );
      }
    } catch (error) {
      errorLogger.error('Redis DELETE error in TaskService:', error);
    }
  }


  /**
   * Get tasks with pagination and advanced filtering
   * @param userId - User ID
   * @param filters - Query filters
   * @param options - Pagination options
   * @returns Paginated tasks with subtasks populated
   */
  async getUserTasksWithPagination(
    userId: Types.ObjectId,
    filters: any,
    options: any,
  ) {
    const query: any = {
      isDeleted: false,
      $or: [
        { ownerUserId: userId },
        { assignedUserIds: userId },
        { createdById: userId },
      ],
    };

    // Apply filters
    if (filters.status) query.status = filters.status;
    if (filters.taskType) query.taskType = filters.taskType;
    if (filters.priority) query.priority = filters.priority;

    // Date range filter
    if (filters.from || filters.to) {
      query.startTime = {};
      if (filters.from) query.startTime.$gte = new Date(filters.from);
      if (filters.to) query.startTime.$lte = new Date(filters.to);
    }

    const result = await this.model.paginate(query, options);

    // ✅ Populate subtasks for each task in the result
    if (result.docs && result.docs.length > 0) {
      const tasksWithSubtasks = await Promise.all(
        result.docs.map(async (task: any) => {
          const { SubTask } = await import('../subTask/subTask.model');
          
          // Get subtasks for this task
          const subtasks = await SubTask.find({
            taskId: task._id,
            isDeleted: false,
          })
            .select('-__v')
            .sort({ order: 1 })
            .lean();

          // Format subtasks
          const formattedSubtasks = subtasks.map((st: any) => ({
            _id: st._id.toString(),
            title: st.title,
            isCompleted: st.isCompleted || false,
            order: st.order || 0,
            duration: st.duration || null,
            completedAt: st.completedAt || null,
          }));

          // Calculate subtask progress
          const totalSubtasks = formattedSubtasks.length;
          const completedSubtasks = formattedSubtasks.filter((st: any) => st.isCompleted).length;
          const subtaskProgressPercentage = totalSubtasks > 0
            ? Math.round((completedSubtasks / totalSubtasks) * 100)
            : 0;

          return {
            ...task.toObject ? task.toObject() : task,
            subtasks: formattedSubtasks,
            subtaskProgress: {
              total: totalSubtasks,
              completed: completedSubtasks,
              percentage: subtaskProgressPercentage,
            },
          };
        })
      );

      result.docs = tasksWithSubtasks;
    }

    return result;
  }

  

  /** ✔️
   * Get task statistics for a user
   * @param userId - User ID
   * @returns Task statistics
   */
  async getTaskStatistics(userId: Types.ObjectId) {
    const cacheKey = this.getCacheKey(
      'statistics',
      undefined,
      userId.toString(),
    );

    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const stats = await this.model.aggregate([
      {
        $match: {
          $or: [{ ownerUserId: userId }, { assignedUserIds: userId }],
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
    };

    stats.forEach((stat: any) => {
      result[stat._id as keyof typeof result] = stat.count;
      result.total += stat.count;
    });

    console.log(
      "task.service -> '/statistics' -> fn: getTaskStatistics =>",
      stats,
    );

    // Cache the result
    await this.setInCache(cacheKey, result, TASK_CACHE_CONFIG.STATISTICS);

    return result;
  }

}
