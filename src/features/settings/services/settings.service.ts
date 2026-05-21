import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { RedisService } from '@app/redis';
import { SettingsType } from '../constants/settings.constants';
import { CreateOrUpdateSettingsDto } from '../dto/settings.dto';
import { SETTINGS_CACHE_CONFIG } from '../constants/settings.cache.constants';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    this.logger.log('✅ Settings Service (Prisma + Cache) initialized');
  }

  private getCacheKey(type: string): string {
    return `${SETTINGS_CACHE_CONFIG.PREFIX}:${type}`;
  }

  async createOrUpdateSettings(type: SettingsType, dto: CreateOrUpdateSettingsDto) {
    this.logger.log(`Creating/updating settings for type: ${type}`);
    const result = await this.prisma.settings.upsert({
      where: { type },
      update: { 
        details: dto.details, 
        introductionVideo: dto.introductionVideo as any 
      },
      create: { 
        type, 
        details: dto.details || '', 
        introductionVideo: dto.introductionVideo as any 
      },
    });
    
    // Invalidate cache
    await this.invalidateCache(type);
    return result;
  }

  async getSettingsByType(type: SettingsType) {
    return this.redisService.getOrSet(
      this.getCacheKey(type),
      async () => {
        const settings = await this.prisma.settings.findUnique({ where: { type } });
        if (!settings) throw new NotFoundException(`Settings not found: ${type}`);
        return settings;
      },
      SETTINGS_CACHE_CONFIG.TTL
    );
  }

  async getAllSettings() {
    return this.prisma.settings.findMany({ orderBy: { type: 'asc' } });
  }

  async deleteSettingsByType(type: SettingsType): Promise<void> {
    await this.prisma.settings.delete({ where: { type } });
    await this.invalidateCache(type);
  }

  private async invalidateCache(type: string): Promise<void> {
    const keys = SETTINGS_CACHE_CONFIG.INVALIDATION_PATTERNS.SETTINGS_UPDATED(type);
    await this.redisService.invalidate(keys);
  }
}
