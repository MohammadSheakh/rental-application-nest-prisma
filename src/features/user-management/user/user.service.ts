import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Redis } from 'ioredis';

import { GenericService } from '../../../common/generic/generic.service';
import { User, UserDocument } from './user.schema';
import { REDIS_CLIENT } from '../../../helpers/redis/redis.module';
import { Task, TaskDocument } from '../../task.module/task/task.schema';
import { ChildrenBusinessUser, ChildrenBusinessUserDocument } from '../../childrenBusinessUser.module/childrenBusinessUser.schema';

/**
 * User Service
 * 
 * 📚 EXPRESS → NESTJS TRANSITION
 * 
 * Express Pattern:
 * - class UserService extends GenericService<typeof User, IUser>
 * - constructor() { super(User); }
 * - Manual model access
 * 
 * NestJS Pattern:
 * - @Injectable() decorator
 * - @InjectModel for Mongoose injection
 * - Generic type parameters
 * - Type-safe operations
 * 
 * Key Benefits:
 * ✅ Automatic dependency injection
 * ✅ Type-safe CRUD operations
 * ✅ Easy to extend with custom methods
 * ✅ Reusable generic pattern
 */
@Injectable()
export class UserService extends GenericService<typeof User, UserDocument> {
  private readonly USER_CACHE_PREFIX = 'user:';
  private readonly USER_CACHE_TTL = 900; // 15 minutes

  constructor(
    @InjectModel(User.name) userModel: Model<UserDocument>,
    @Inject(REDIS_CLIENT) private redisClient: Redis,
  ) {
    super(userModel);
  }

  /**
   * Find user by email
   * Custom method (not in generic service)
   */
  async findByEmail(email: string, includePassword = false): Promise<UserDocument | null> {
    const query = this.model.findOne({ email: email.toLowerCase(), isDeleted: false });

    if (includePassword) {
      query.select('+password');
    }

    return query.lean().exec();
  }

  /**
   * Find user by ID with cache
   */
  async findByIdWithCache(id: string): Promise<UserDocument | null> {
    const cacheKey = `${this.USER_CACHE_PREFIX}${id}`;

    // Try cache first
    const cached = await this.redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Cache miss - query database
    const user = await this.findById(id);

    if (user) {
      // Cache for 15 minutes
      await this.redisClient.set(
        cacheKey,
        JSON.stringify(user),
        'EX',
        this.USER_CACHE_TTL,
      );
    }

    return user;
  }

  /**
   * Invalidate user cache
   */
  async invalidateCache(id: string): Promise<void> {
    const cacheKey = `${this.USER_CACHE_PREFIX}${id}`;
    await this.redisClient.del(cacheKey);
  }

  /**
   * Update user's preferred time
   */
  async updatePreferredTime(userId: string, preferredTime: string): Promise<UserDocument | null> {
    const result = await this.updateById(userId, { preferredTime });
    
    // Invalidate cache
    if (result) {
      await this.invalidateCache(userId);
    }

    return result;
  }

  /**
   * Get user statistics
   * 
   * Calculates task statistics for a user
   * Includes tasks where user is owner or assigned
   */
  async getUserStatistics(userId: string): Promise<{
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
  }> {
    const userIdObj = new Types.ObjectId(userId);

    // Use aggregation for better performance
    const stats = await (this as any).model.aggregate([
      {
        $match: {
          $or: [
            { ownerUserId: userIdObj },
            { assignedUserIds: userIdObj },
          ],
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          pendingTasks: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
        },
      },
    ]);

    if (stats.length === 0) {
      return {
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
      };
    }

    return {
      totalTasks: stats[0].totalTasks,
      completedTasks: stats[0].completedTasks,
      pendingTasks: stats[0].pendingTasks,
    };
  }

  /**
   * Check if user is secondary user
   * 
   * Secondary users can create tasks for the family
   * Checked via ChildrenBusinessUser relationship
   */
  async isSecondaryUser(userId: string): Promise<boolean> {
    const relationship = await (this as any).model.exists({
      childUserId: new Types.ObjectId(userId),
      isSecondaryUser: true,
      status: 'active',
      isDeleted: false,
    });

    return !!relationship;
  }
}
