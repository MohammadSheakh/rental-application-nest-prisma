import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './schemas/settings.schema';
import { SettingsType, ALLOWED_SETTINGS_TYPES } from '../constants/settings.constants';
import { CreateOrUpdateSettingsDto } from './dto/settings.dto';

/**
 * Settings Service
 * Handles static content management
 *
 * @version 1.0.0 (NestJS Migration)
 * @author Senior Engineering Team
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectModel(Settings.name)
    private settingsModel: Model<SettingsDocument>,
  ) {
    this.logger.log('✅ Settings Service initialized');
  }

  /**
   * Create or update settings
   * If settings exists for type, update it. Otherwise, create new.
   *
   * @param type - Settings type
   * @param dto - Settings data
   * @returns Created/updated settings
   */
  async createOrUpdateSettings(
    type: SettingsType,
    dto: CreateOrUpdateSettingsDto,
  ): Promise<SettingsDocument> {
    this.logger.log(`Creating/updating settings for type: ${type}`);

    // Validate type
    if (!ALLOWED_SETTINGS_TYPES.includes(type)) {
      throw new BadRequestException(
        `Unsupported settings type: ${type}. Allowed types are: ${ALLOWED_SETTINGS_TYPES.join(', ')}`,
      );
    }

    // Find existing setting by type
    const existingSetting = await this.settingsModel.findOne({ type });

    if (existingSetting) {
      // Update existing setting
      existingSetting.details = dto.details || existingSetting.details;
      if (dto.introductionVideo) {
        existingSetting.introductionVideo = dto.introductionVideo;
      }
      await existingSetting.save();
      this.logger.log(`Updated settings for type: ${type}`);
      return existingSetting;
    } else {
      // Create new setting
      const newSetting = await this.settingsModel.create({
        type,
        details: dto.details || '',
        introductionVideo: dto.introductionVideo,
      });
      this.logger.log(`Created new settings for type: ${type}`);
      return newSetting;
    }
  }

  /**
   * Get settings by type
   *
   * @param type - Settings type
   * @returns Settings document
   */
  async getSettingsByType(type: SettingsType): Promise<SettingsDocument[]> {
    this.logger.log(`Getting settings for type: ${type}`);

    // Validate type
    if (!ALLOWED_SETTINGS_TYPES.includes(type)) {
      throw new BadRequestException(
        `Unsupported settings type: ${type}. Allowed types are: ${ALLOWED_SETTINGS_TYPES.join(', ')}`,
      );
    }

    const settings = await this.settingsModel.find({ type }).sort({ createdAt: -1 });

    if (settings.length === 0) {
      throw new NotFoundException(
        `Settings not found for type: ${type}`,
      );
    }

    this.logger.log(`Found ${settings.length} settings for type: ${type}`);
    return settings;
  }

  /**
   * Get all settings
   *
   * @returns All settings documents
   */
  async getAllSettings(): Promise<SettingsDocument[]> {
    this.logger.debug('Getting all settings');
    return this.settingsModel.find({}).sort({ type: 1 });
  }

  /**
   * Get single setting by type (returns first match)
   *
   * @param type - Settings type
   * @returns Settings document or null
   */
  async getSingleSettingByType(type: SettingsType): Promise<SettingsDocument | null> {
    this.logger.debug(`Getting single setting for type: ${type}`);
    return this.settingsModel.findOne({ type });
  }

  /**
   * Delete settings by type (soft delete would require adding isDeleted field)
   *
   * @param type - Settings type
   */
  async deleteSettingsByType(type: SettingsType): Promise<void> {
    this.logger.log(`Deleting settings for type: ${type}`);

    const result = await this.settingsModel.deleteOne({ type });

    if (result.deletedCount === 0) {
      throw new NotFoundException(`Settings not found for type: ${type}`);
    }

    this.logger.log(`Deleted settings for type: ${type}`);
  }
}
