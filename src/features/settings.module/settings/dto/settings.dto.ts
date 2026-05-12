import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
} from 'class-validator';
import { SettingsType } from '../constants/settings.constants';

/**
 * DTO for creating or updating settings
 * Used by admin to manage static content
 */
export class CreateOrUpdateSettingsDto {
  @ApiProperty({
    description: 'Settings type',
    enum: SettingsType,
    example: SettingsType.aboutUs,
  })
  @IsNotEmpty({ message: 'Type is required' })
  @IsEnum(SettingsType, {
    message: 'Invalid settings type',
  })
  type: SettingsType;

  @ApiPropertyOptional({
    description: 'Settings content/details',
    example: 'About us content here...',
  })
  @IsOptional()
  @IsString({ message: 'Details must be a string' })
  details?: string;

  @ApiPropertyOptional({
    description: 'Introduction video metadata (for introductionVideo type)',
    example: { url: 'https://youtube.com/...', title: 'Welcome Video' },
  })
  @IsOptional()
  @IsObject({ message: 'introductionVideo must be an object' })
  introductionVideo?: Record<string, any>;
}

/**
 * DTO for querying settings by type
 */
export class GetSettingsByTypeDto {
  @ApiProperty({
    description: 'Settings type',
    enum: SettingsType,
    example: SettingsType.aboutUs,
  })
  @IsNotEmpty({ message: 'Type is required' })
  @IsEnum(SettingsType, {
    message: 'Invalid settings type',
  })
  type: SettingsType;
}
