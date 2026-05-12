import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Redis } from 'ioredis';

import { GenericService } from '../../../common/generic/generic.service';
import { UserProfile, UserProfileDocument } from './userProfile.schema';
import { REDIS_CLIENT } from '../../../helpers/redis/redis.module';

/**
 * UserProfile Service
 * 
 * Extends GenericService for CRUD operations
 * Adds custom business logic methods
 */
@Injectable()
export class UserProfileService extends GenericService<typeof UserProfile, UserProfileDocument> {
  private readonly PROFILE_CACHE_PREFIX = 'userProfile:';
  private readonly PROFILE_CACHE_TTL = 900; // 15 minutes

  constructor(
    @InjectModel(UserProfile.name) profileModel: Model<UserProfileDocument>,
    @Inject(REDIS_CLIENT) private redisClient: Redis,
  ) {
    super(profileModel);
  }

  /**
   * Find profile by user ID
   */
  async findByUserId(userId: string): Promise<UserProfileDocument | null> {
    return this.model.findOne({ userId: new Types.ObjectId(userId), isDeleted: false }).lean().exec();
  }

  /**
   * Find profile by user ID with cache
   */
  async findByUserIdWithCache(userId: string): Promise<UserProfileDocument | null> {
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
  async updateByUserId(userId: string, data: Partial<UserProfile>): Promise<UserProfileDocument | null> {
    const profile = await this.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    const result = await this.model.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      data,
      { new: true, runValidators: true },
    ).lean().exec();

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
  async updateSupportMode(userId: string, supportMode: string): Promise<UserProfileDocument | null> {
    return this.updateByUserId(userId, { supportMode });
  }

  /**
   * Update notification style preference
   */
  async updateNotificationStyle(userId: string, notificationStyle: string): Promise<UserProfileDocument | null> {
    return this.updateByUserId(userId, { notificationStyle });
  }

  /**
   * Get profile with user details
   */
  async getProfileWithUser(userId: string): Promise<any> {
    const profile = await this.model.findOne({
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    })
    .populate('user', 'name email profileImage role')
    .lean()
    .exec();

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    return profile;
  }
}
