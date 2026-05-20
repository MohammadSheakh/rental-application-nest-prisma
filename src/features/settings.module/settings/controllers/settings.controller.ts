import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SettingsService } from '../services/settings.service';
import { CreateOrUpdateSettingsDto } from '../dto/settings.dto';
import { SettingsType } from '../../constants/settings.constants';
import { AuthGuard, RolesGuard, Roles, TransformResponseInterceptor, SlidingWindowRateLimitGuard, RateLimit } from '@app/common';
import { SETTINGS_RATE_LIMITS } from '../../constants/settings.cache.constants';

@Controller('settings')
@ApiTags('Settings')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, RolesGuard, SlidingWindowRateLimitGuard)
@UseInterceptors(TransformResponseInterceptor)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create or update settings', description: 'Create or update static content (Admin only)' })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  @Roles('admin', 'subAdmin')
  @RateLimit(SETTINGS_RATE_LIMITS.MANAGE_SETTINGS)
  async createOrUpdateSettings(@Query('type') type: SettingsType, @Body() dto: CreateOrUpdateSettingsDto) {
    const result = await this.settingsService.createOrUpdateSettings(type, { ...dto, type });
    return { success: true, data: result, message: `${type} updated successfully` };
  }

  @Get()
  @ApiOperation({ summary: 'Get settings by type', description: 'Get static content by type' })
  @ApiQuery({ name: 'type', enum: SettingsType })
  @ApiResponse({ status: 200, description: 'Settings retrieved successfully' })
  @RateLimit(SETTINGS_RATE_LIMITS.GET_SETTINGS)
  async getSettingsByType(@Query('type') type: SettingsType) {
    const result = await this.settingsService.getSettingsByType(type);
    return { success: true, data: result, message: `${type} fetched successfully` };
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all settings', description: 'Get all static content (Admin only)' })
  @ApiResponse({ status: 200, description: 'All settings retrieved' })
  @Roles('admin')
  @RateLimit(SETTINGS_RATE_LIMITS.MANAGE_SETTINGS)
  async getAllSettings() {
    const result = await this.settingsService.getAllSettings();
    return { success: true, data: result, message: 'All settings retrieved successfully' };
  }

  @Delete()
  @ApiOperation({ summary: 'Delete settings', description: 'Delete settings by type (Admin only)' })
  @ApiQuery({ name: 'type', enum: SettingsType })
  @ApiResponse({ status: 200, description: 'Settings deleted successfully' })
  @Roles('admin')
  @RateLimit(SETTINGS_RATE_LIMITS.MANAGE_SETTINGS)
  async deleteSettingsByType(@Query('type') type: SettingsType) {
    await this.settingsService.deleteSettingsByType(type);
    return { success: true, message: `${type} deleted successfully` };
  }
}
