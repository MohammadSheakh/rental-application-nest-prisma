import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@app/database';
import { SettingsType } from '../constants/settings.constants';
import { CreateOrUpdateSettingsDto } from '../dto/settings.dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('✅ Settings Service (Prisma) initialized');
  }

  async createOrUpdateSettings(
    type: SettingsType,
    dto: CreateOrUpdateSettingsDto,
  ) {
    this.logger.log(`Creating/updating settings for type: ${type}`);

    return await this.prisma.settings.upsert({
      where: { type: type as any },
      update: {
        details: dto.details,
        introductionVideo: dto.introductionVideo as any,
      },
      create: {
        type: type as any,
        details: dto.details || '',
        introductionVideo: dto.introductionVideo as any,
      },
    });
  }

  async getSettingsByType(type: SettingsType) {
    this.logger.log(`Getting settings for type: ${type}`);
    const settings = await this.prisma.settings.findUnique({
      where: { type: type as any },
    });

    if (!settings) {
      throw new NotFoundException(`Settings not found for type: ${type}`);
    }

    return [settings];
  }

  async getAllSettings() {
    this.logger.debug('Getting all settings');
    return this.prisma.settings.findMany({ orderBy: { type: 'asc' } });
  }

  async getSingleSettingByType(type: SettingsType) {
    this.logger.debug(`Getting single setting for type: ${type}`);
    return this.prisma.settings.findUnique({ where: { type: type as any } });
  }

  async deleteSettingsByType(type: SettingsType): Promise<void> {
    this.logger.log(`Deleting settings for type: ${type}`);
    try {
        await this.prisma.settings.delete({ where: { type: type as any } });
    } catch (e) {
        throw new NotFoundException(`Settings not found for type: ${type}`);
    }
    this.logger.log(`Deleted settings for type: ${type}`);
  }
}
