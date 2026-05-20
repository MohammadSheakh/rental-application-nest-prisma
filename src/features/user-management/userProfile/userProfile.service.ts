import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { Prisma, UserProfile } from '@prisma/client';
import Redis from 'ioredis';

import { GenericService } from '@app/common';
import { PrismaService } from '@app/database';
import { REDIS_CLIENT } from '@app/redis';
import { USER_CACHE_CONFIG } from '../user/user.constants';


const publicUserProfileSelect = {
  id: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserProfileSelect;

type UserProfileRecord = Prisma.UserProfileGetPayload<{
  select: typeof publicUserProfileSelect;
}>;


/**
 * UserProfile Service
 * 
 * 
 */
@Injectable()
export class UserProfileService extends GenericService<any, UserProfileRecord> {
  private readonly logger = new Logger(UserProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
  ) {
    super((prisma as any).userProfile, publicUserProfileSelect);
  }

  private getCacheKey(userId: string): string {
    return `${USER_CACHE_CONFIG.PREFIX}:profile:${userId}`;
  }

  /**
   * Find profile by user ID with cache
   */
  async findByUserIdWithCache(userId: string): Promise<UserProfile | null> {
    const cacheKey = this.getCacheKey(userId);

    try {
      if (this.redisClient) {
        const cached = await this.redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached);
      }
    } catch (err) {
      this.logger.error(`Cache fetch error: ${err.message}`);
    }

    const profile = await this.prisma.userProfile.findFirst({
      where: { userId, isDeleted: false },
    });

    if (profile && this.redisClient) {
      await this.redisClient.set(
        cacheKey,
        JSON.stringify(profile),
        'EX',
        USER_CACHE_CONFIG.PROFILE,
      );
    }

    return profile;
  }

  /**
   * Update profile with targeted invalidation
   */
  async updateByUserId(
    userId: string,
    data: Prisma.UserProfileUpdateInput,
  ): Promise<UserProfile | null> {
    const profile = await this.prisma.userProfile.findFirst({
      where: { userId, isDeleted: false },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    const result = await this.prisma.userProfile.update({
      where: { userId },
      data,
    });

    if (result) {
      await this.invalidateCache(userId);
    }

    return result;
  }

  /**
   * Invalidate profile cache using patterns
   */
  async invalidateCache(userId: string): Promise<void> {
    if (!this.redisClient) return;
    
    try {
      // Clear both profile and generic user stats if needed
      const keys = USER_CACHE_CONFIG.INVALIDATION_PATTERNS.PROFILE_UPDATED(userId);
      await this.redisClient.del(this.getCacheKey(userId), ...keys);
      this.logger.debug(`Invalidated cache for user profile: ${userId}`);
    } catch (err) {
      this.logger.error(`Cache invalidation error: ${err.message}`);
    }
  }

  /**
   * Update support mode preference
   */
  async updateSupportMode(userId: string, supportMode: string): Promise<UserProfile | null> {
    return this.updateByUserId(userId, { supportMode });
  }

  /**
   * Update notification style preference
   */
  async updateNotificationStyle(userId: string, notificationStyle: string): Promise<UserProfile | null> {
    return this.updateByUserId(userId, { notificationStyle });
  }

  /**
   * Get profile with user details
   */
  async getProfileWithUser(userId: string): Promise<any> {
    const profile = await this.findByUserIdWithCache(userId);

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    // Here we can merge or fetch fresh user data
    return await this.prisma.userProfile.findFirst({
      where: { userId, isDeleted: false },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImageUrl: true,
            role: true,
          },
        },
      },
    });
  }
}
