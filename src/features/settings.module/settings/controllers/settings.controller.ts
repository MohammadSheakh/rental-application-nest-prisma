import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SettingsService } from './services/settings.service';
import { CreateOrUpdateSettingsDto, GetSettingsByTypeDto } from './dto/settings.dto';
import { SettingsType } from '../constants/settings.constants';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Throttle } from '@nestjs/throttler';

/**
 * Settings Controller
 * Handles static content management
 *
 * @version 1.0.0 (NestJS Migration)
 * @author Senior Engineering Team
 */
@Controller('settings')
@ApiTags('Settings')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Create or update settings (Admin only)
   */
  @Post()
  @ApiOperation({
    summary: 'Create or update settings',
    description: 'Create or update static content (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid settings type' })
  @Roles('admin', 'subAdmin')
  @Throttle(10, 60)
  async createOrUpdateSettings(
    @Query('type') type: SettingsType,
    @Body() dto: CreateOrUpdateSettingsDto,
  ) {
    // Override type from query params
    const settingsData = { ...dto, type };
    const result = await this.settingsService.createOrUpdateSettings(type, settingsData);

    return {
      success: true,
      data: result,
      message: `${type} updated successfully`,
    };
  }

  /**
   * Get settings by type (Public)
   */
  @Get()
  @ApiOperation({
    summary: 'Get settings by type',
    description: 'Get static content by type (e.g., About Us, Privacy Policy)',
  })
  @ApiQuery({ name: 'type', enum: SettingsType })
  @ApiResponse({ status: 200, description: 'Settings retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Settings not found' })
  @Throttle(100, 60)
  async getSettingsByType(@Query('type') type: SettingsType) {
    const result = await this.settingsService.getSettingsByType(type);

    return {
      success: true,
      data: result,
      message: `${type} fetched successfully`,
    };
  }

  /**
   * Get all settings (Admin only)
   */
  @Get('all')
  @ApiOperation({
    summary: 'Get all settings',
    description: 'Get all static content (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'All settings retrieved' })
  @Roles('admin')
  @Throttle(10, 60)
  async getAllSettings() {
    const result = await this.settingsService.getAllSettings();

    return {
      success: true,
      data: result,
      message: 'All settings retrieved successfully',
    };
  }

  /**
   * Delete settings by type (Admin only)
   */
  @Delete()
  @ApiOperation({
    summary: 'Delete settings',
    description: 'Delete settings by type (Admin only)',
  })
  @ApiQuery({ name: 'type', enum: SettingsType })
  @ApiResponse({ status: 200, description: 'Settings deleted successfully' })
  @ApiResponse({ status: 404, description: 'Settings not found' })
  @Roles('admin')
  @Throttle(5, 60)
  async deleteSettingsByType(@Query('type') type: SettingsType) {
    await this.settingsService.deleteSettingsByType(type);

    return {
      success: true,
      message: `${type} deleted successfully`,
    };
  }
}
