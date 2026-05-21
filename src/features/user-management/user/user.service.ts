import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { GenericService } from '@app/common';
import { RedisService } from '@app/redis';
import { PrismaService } from '@app/database';
import { USER_CACHE_CONFIG } from './user.constants';
import { UpdateProfileDto } from './dto/update-profile.dto';

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
export class UserService extends GenericService<Prisma.UserDelegate, PublicUserRecord> {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    super(prisma.user, publicUserSelect);
  }

  /**
   * Cache Key Generator
   */
  private getCacheKey(type: 'profile' | 'stats', id: string): string {
    return type === 'profile' 
      ? `${USER_CACHE_CONFIG.PREFIX}:${id}` 
      : `${USER_CACHE_CONFIG.PREFIX}:stats:${id}`;
  }

  /**
   * Find by email
   */
  async findByEmail(
    email: string,
    includePassword = false,
  ): Promise<PublicUserRecord | UserWithPasswordRecord | null> {
    return await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        isDeleted: false,
      },
      select: includePassword ? userWithPasswordSelect : publicUserSelect,
    });
  }

  /**
   * Update user and their profile (nested)
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<PublicUserRecord | null> {
    const { name, phoneNumber, email, ...profileData } = dto as any;

    const updateData: Prisma.UserUpdateInput = {};
    if (name) updateData.name = name;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (email) updateData.email = email;

    // Handle nested UserProfile updates
    if (Object.keys(profileData).length > 0) {
      updateData.ownedProfile = {
        upsert: {
          create: { ...profileData },
          update: { ...profileData },
        },
      };
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: publicUserSelect,
    });

    if (updatedUser) {
      await this.invalidateCache(userId);
    }

    return updatedUser;
  }

  /**
   * Find by ID with sliding window cache
   */
  async findByIdWithCache(id: string): Promise<PublicUserRecord | null> {
    return this.redisService.getOrSet(
      this.getCacheKey('profile', id),
      () => this.findById(id),
      USER_CACHE_CONFIG.PROFILE
    );
  }

  /**
   * Invalidate cache
   */
  async invalidateCache(id: string): Promise<void> {
    const keys = USER_CACHE_CONFIG.INVALIDATION_PATTERNS.PROFILE_UPDATED(id);
    await this.redisService.invalidate(keys as any);
    this.logger.log(`Invalidated cache for user: ${id}`);
  }

  /**
   * Update preferred time
   */
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
    return this.redisService.getOrSet(
      this.getCacheKey('stats', userId),
      async () => {
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

        return { totalTasks, completedTasks, pendingTasks };
      },
      USER_CACHE_CONFIG.STATISTICS
    );
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
