import { Inject, Injectable } from '@nestjs/common';

import { GenericService } from '../../../common/generic/generic.service';
import { REDIS_CLIENT } from '../../../core/database/redis/redis.constants';
import { PrismaService } from '../../../core/database/prisma/prisma.service';

type CacheClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  password?: string | null;
  role: string;
  profileImageUrl?: string | null;
  phoneNumber?: string | null;
  isEmailVerified: boolean;
  authProvider: string;
  preferredTime: string;
  isResetPassword: boolean;
  failedLoginAttempts?: number;
  lockUntil?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

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
};

@Injectable()
export class UserService extends GenericService<any, Partial<UserRecord>> {
  private readonly USER_CACHE_PREFIX = 'user:';
  private readonly USER_CACHE_TTL = 900; // 15 minutes

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redisClient: CacheClient | null,
  ) {
    super((prisma as any).user, publicUserSelect);
  }

  async findByEmail(
    email: string,
    includePassword = false,
  ): Promise<Partial<UserRecord> | null> {
    return await (this.prisma as any).user.findFirst({
      where: {
        email: email.toLowerCase(),
        isDeleted: false,
      },
      select: includePassword
        ? { ...publicUserSelect, password: true }
        : publicUserSelect,
    });
  }

  async findByIdWithCache(id: string): Promise<Partial<UserRecord> | null> {
    const cacheKey = `${this.USER_CACHE_PREFIX}${id}`;
    const cached = await this.redisClient?.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as Partial<UserRecord>;
    }

    const user = await this.findById(id);

    if (user) {
      await this.redisClient?.set(cacheKey, JSON.stringify(user), {
        EX: this.USER_CACHE_TTL,
      });
    }

    return user;
  }

  async invalidateCache(id: string): Promise<void> {
    await this.redisClient?.del(`${this.USER_CACHE_PREFIX}${id}`);
  }

  async updatePreferredTime(
    userId: string,
    preferredTime: string,
  ): Promise<Partial<UserRecord> | null> {
    const result = await this.updateById(userId, { preferredTime });

    if (result) {
      await this.invalidateCache(userId);
    }

    return result;
  }

  async getUserStatistics(userId: string): Promise<{
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
  }> {
    const taskDelegate = (this.prisma as any).task;

    if (!taskDelegate) {
      return {
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
      };
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

    return {
      totalTasks,
      completedTasks,
      pendingTasks,
    };
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
