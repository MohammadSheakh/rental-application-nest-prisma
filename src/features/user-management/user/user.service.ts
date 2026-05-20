import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';

import { GenericService } from '@app/common';
import { REDIS_CLIENT } from '@app/redis';
import { PrismaService } from '@app/database';
import { USER_CACHE_CONFIG } from './user.constants';

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  profileImageUrl: true,
  phoneNumber: true,
  isEmailVerified: true,
  authProvider: true,
  preferredTime: true,
  isResetPassword: true,
  isDeleted: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const userWithPasswordSelect = {
  ...publicUserSelect,
  password: true,
} satisfies Prisma.UserSelect;

type PublicUserRecord = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

type UserWithPasswordRecord = Prisma.UserGetPayload<{
  select: typeof userWithPasswordSelect;
}>;

@Injectable()
export class UserService extends GenericService<any, PublicUserRecord> {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
  ) {
    super((prisma as any).user, publicUserSelect);
  }

  /**
   * Cache Key Generator
   */
  private getCacheKey(type: 'profile' | 'stats', id: string): string {
    return type === 'profile' 
      ? `${USER_CACHE_CONFIG.PREFIX}:${id}` 
      : `${USER_CACHE_CONFIG.PREFIX}:stats:${id}`;
  }

  async findByEmail(
    email: string,
    includePassword = false,
  ): Promise<PublicUserRecord | UserWithPasswordRecord | null> {
    return await (this.prisma as any).user.findFirst({
      where: {
        email: email.toLowerCase(),
        isDeleted: false,
      },
      select: includePassword ? userWithPasswordSelect : publicUserSelect,
    });
  }

  /**
   * Find by ID with Sliding Window Cache logic
   */
  async findByIdWithCache(id: string): Promise<PublicUserRecord | null> {
    const cacheKey = this.getCacheKey('profile', id);
    
    try {
      if (this.redisClient) {
        const cached = await this.redisClient.get(cacheKey);
        if (cached) {
          this.logger.debug(`Cache hit: ${cacheKey}`);
          return JSON.parse(cached) as PublicUserRecord;
        }
      }
    } catch (err) {
      this.logger.error(`Redis error: ${err.message}`);
    }

    const user = await this.findById(id);

    if (user && this.redisClient) {
      try {
        await this.redisClient.set(
          cacheKey, 
          JSON.stringify(user), 
          'EX', 
          USER_CACHE_CONFIG.PROFILE
        );
      } catch (err) {
        this.logger.error(`Redis set error: ${err.message}`);
      }
    }

    return user;
  }

  /**
   * Invalidate cache using senior-level patterns
   */
  async invalidateCache(id: string): Promise<void> {
    if (!this.redisClient) return;
    
    try {
      const keys = USER_CACHE_CONFIG.INVALIDATION_PATTERNS.PROFILE_UPDATED(id);
      await this.redisClient.del(...keys);
      this.logger.log(`Invalidated cache for user: ${id}`);
    } catch (err) {
      this.logger.error(`Cache invalidation error: ${err.message}`);
    }
  }

  async updatePreferredTime(
    userId: string,
    preferredTime: string,
  ): Promise<PublicUserRecord | null> {
    const result = await this.updateById(userId, { preferredTime });

    if (result) {
      await this.invalidateCache(userId);
    }

    return result;
  }

  /**
   * Get statistics with caching
   */
  async getUserStatistics(userId: string): Promise<{
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
  }> {
    const cacheKey = this.getCacheKey('stats', userId);

    // Try cache
    if (this.redisClient) {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const taskDelegate = (this.prisma as any).task;

    if (!taskDelegate) {
      return { totalTasks: 0, completedTasks: 0, pendingTasks: 0 };
    }

    const baseWhere = {
      isDeleted: false,
      OR: [{ ownerUserId: userId }, { assignedUserIds: { has: userId } }],
    };

    const [totalTasks, completedTasks, pendingTasks] = await Promise.all([
      taskDelegate.count({ where: baseWhere }),
      taskDelegate.count({ where: { ...baseWhere, status: 'completed' } }),
      taskDelegate.count({ where: { ...baseWhere, status: 'pending' } }),
    ]);

    const stats = { totalTasks, completedTasks, pendingTasks };

    // Set cache
    if (this.redisClient) {
      await this.redisClient.set(
        cacheKey, 
        JSON.stringify(stats), 
        'EX', 
        USER_CACHE_CONFIG.STATISTICS
      );
    }

    return stats;
  }

  async isSecondaryUser(userId: string): Promise<boolean> {
    const relationshipDelegate = (this.prisma as any).childrenBusinessUser;

    if (!relationshipDelegate) {
      return false;
    }

    const relationship = await relationshipDelegate.findFirst({
      where: {
        childUserId: userId,
        isSecondaryUser: true,
        status: 'active',
        isDeleted: false,
      },
      select: { id: true },
    });

    return !!relationship;
  }
}
