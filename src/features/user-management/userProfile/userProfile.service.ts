import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Prisma, UserProfile } from '@prisma/client';
import { Redis } from 'ioredis';

import { GenericService } from '../../../common/generic/generic.service';

import { PrismaService } from 'src/core/database/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/core/database/redis/redis.constants';


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
 * Extends GenericService for CRUD operations
 * Adds custom business logic methods
 */
@Injectable()
export class UserProfileService extends GenericService<any, UserProfileRecord> {
  private readonly PROFILE_CACHE_PREFIX = 'userProfile:';
  private readonly PROFILE_CACHE_TTL = 900; // 15 minutes

  constructor(
    private readonly prisma: PrismaService,   // ← replaces @InjectModel
        
    // @InjectModel(UserProfile.name) profileModel: Model<UserProfileDocument>,
    @Inject(REDIS_CLIENT) private redisClient: Redis,
  ) {
    // super(profileModel);
    super((prisma as any).userProfile, publicUserProfileSelect);
  }

  /**
   * Find profile by user ID
   */
  async findByUserId(userId: string): Promise<UserProfile | null> {
    return this.prisma.userProfile.findFirst({
      where: { userId, isDeleted: false },
    });
  }

  /**
   * Find profile by user ID with cache
   */
  async findByUserIdWithCache(userId: string): Promise<UserProfile | null> {
    const cacheKey = `${this.PROFILE_CACHE_PREFIX}${userId}`;

    // Try cache first
    const cached = await this.redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Cache miss - query database
    const profile = await this.findByUserId(userId);

    if (profile) {
      // Cache for 15 minutes
      await this.redisClient.set(
        cacheKey,
        JSON.stringify(profile),
        'EX',
        this.PROFILE_CACHE_TTL,
      );
    }

    return profile;
  }

  /**
   * Update profile by user ID
   */
  async updateByUserId(
    userId: string,
    data: Prisma.UserProfileUpdateInput,
  ): Promise<UserProfile | null> {
    const profile = await this.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    const result = await this.prisma.userProfile.update({
      where: { userId },
      data,
    });

    // Invalidate cache
    if (result) {
      await this.invalidateCache(userId);
    }

    return result;
  }

  /**
   * Invalidate profile cache
   */
  async invalidateCache(userId: string): Promise<void> {
    const cacheKey = `${this.PROFILE_CACHE_PREFIX}${userId}`;
    await this.redisClient.del(cacheKey);
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
    const profile = await this.prisma.userProfile.findFirst({
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

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    return profile;
  }
}
