import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Settings } from '@prisma/client';
import { PrismaService } from '@app/database';
import { RedisService } from '@app/redis';
import {
  PaginateOptions,
  PaginateResult,
  CursorPaginateOptions,
  CursorPaginateResult,
  cleanFilters,
  parseSort,
  buildProjection,
} from '@app/common';
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

  async createOrUpdateSettings(
    type: SettingsType,
    dto: CreateOrUpdateSettingsDto,
  ) {
    this.logger.log(`Creating/updating settings for type: ${type}`);

    const updateData: Prisma.SettingsUpdateInput = {};
    if (dto.details !== undefined) {
      updateData.details = dto.details;
    }
    if (dto.introductionVideo !== undefined) {
      updateData.introductionVideo = dto.introductionVideo as Prisma.InputJsonValue;
    }

    const result: Settings = await this.prisma.settings.upsert({
      where: { type },
      update: updateData,
      create: {
        type,
        details: dto.details || '',
        // introductionVideo: (dto.introductionVideo as Prisma.InputJsonValue) ?? null,
      },
    });

    // Invalidate cache
    await this.invalidateCache(type);
    return result;
  }

  async getSettingsByType(type: SettingsType) {
    return this.redisService.getOrSet(
      this.getCacheKey(type),
      () => this.fetchSettings(type),
      SETTINGS_CACHE_CONFIG.TTL,
    );
  }

  private async fetchSettings(type: SettingsType) {
    const settings = await this.prisma.settings.findUnique({ where: { type } });
    if (!settings) throw new NotFoundException(`Settings not found: ${type}`);
    return [settings];
  }

  async getAllSettings() {
    return this.prisma.settings.findMany({ orderBy: { type: 'asc' } });
  }

  async getAllWithPagination(
    filters: Record<string, any> = {},
    options: PaginateOptions,
    include?: Record<string, any>,
    select?: Record<string, boolean>,
  ): Promise<PaginateResult<Settings>> {
    const page = Number(options.page) > 0 ? Number(options.page) : 1;
    const limit = Number(options.limit) || 10;
    const where = cleanFilters(filters) as Prisma.SettingsWhereInput;
    const orderBy = parseSort(options.sortBy, 'type') as Prisma.SettingsOrderByWithRelationInput;

    const [docs, total] = await Promise.all([
      this.prisma.settings.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        ...buildProjection(include, select),
      }),
      this.prisma.settings.count({ where }),
    ]);

    return {
      docs,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAllWithPaginationCursor(
    filters: Record<string, any> = {},
    options: CursorPaginateOptions,
    include?: Record<string, any>,
    select?: Record<string, boolean>,
  ): Promise<CursorPaginateResult<Settings>> {
    const limit = Number(options.limit) || 10;
    const where = cleanFilters(filters) as Prisma.SettingsWhereInput;

    // For cursor pagination, sortBy defaults to 'id' or another unique field to avoid duplicates.
    // If not specified, we sort by 'id' ascending as a reliable cursor.
    const orderBy = parseSort(options.sortBy, 'id') as Prisma.SettingsOrderByWithRelationInput;

    const take = limit + 1;
    const prismaOptions: Prisma.SettingsFindManyArgs = {
      where,
      take,
      orderBy,
      ...buildProjection(include, select),
    };

    if (options.cursor) {
      prismaOptions.cursor = { id: options.cursor };
      prismaOptions.skip = 1; // Skip the cursor element itself
    }

    const docs = await this.prisma.settings.findMany(prismaOptions);

    let nextCursor: string | undefined = undefined;
    let hasNextPage = false;

    if (docs.length > limit) {
      hasNextPage = true;
      const nextItem = docs.pop();
      nextCursor = nextItem?.id;
    }

    return {
      docs,
      nextCursor,
      hasNextPage,
    };
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
