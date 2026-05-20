import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaService } from '@app/database';
import { REDIS_CLIENT } from '@app/redis';
import { SettingsType } from '../constants/settings.constants';
import { CreateOrUpdateSettingsDto } from '../dto/settings.dto';
import { SETTINGS_CACHE_CONFIG } from '../constants/settings.cache.constants';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {
    this.logger.log('✅ Settings Service (Prisma + Cache) initialized');
  }

  private getCacheKey(type: string): string {
    return `${SETTINGS_CACHE_CONFIG.PREFIX}:${type}`;
  }

  async createOrUpdateSettings(type: SettingsType, dto: CreateOrUpdateSettingsDto) {
    this.logger.log(`Creating/updating settings for type: ${type}`);
    const result = await this.prisma.settings.upsert({
      where: { type: type as any },
      update: { details: dto.details, introductionVideo: dto.introductionVideo as any },
      create: { type: type as any, details: dto.details || '', introductionVideo: dto.introductionVideo as any },
    });
    
    // Invalidate cache
    await this.invalidateCache(type);
    return result;
  }

  async getSettingsByType(type: SettingsType) {
    const cacheKey = this.getCacheKey(type);
    if (this.redisClient) {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) return [JSON.parse(cached)];
    }

    const settings = await this.prisma.settings.findUnique({ where: { type: type as any } });
    if (!settings) throw new NotFoundException(`Settings not found: ${type}`);

    if (this.redisClient) {
      await this.redisClient.set(cacheKey, JSON.stringify(settings), 'EX', SETTINGS_CACHE_CONFIG.TTL);
    }
    return [settings];
  }

  async getAllSettings() {
    return this.prisma.settings.findMany({ orderBy: { type: 'asc' } });
  }

  async deleteSettingsByType(type: SettingsType): Promise<void> {
    await this.prisma.settings.delete({ where: { type: type as any } });
    await this.invalidateCache(type);
  }

  private async invalidateCache(type: string): Promise<void> {
    if (!this.redisClient) return;
    const keys = SETTINGS_CACHE_CONFIG.INVALIDATION_PATTERNS.SETTINGS_UPDATED(type);
    await this.redisClient.del(...keys);
  }
}
