import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsOptional,
  IsMongoId,
  IsEnum,
} from 'class-validator';
import { AuthProvider } from '../oauthAccount.schema';

/**
 * DTO for creating OAuth account
 */
export class CreateOAuthAccountDto {
  @ApiProperty({ description: 'User ID', example: '507f1f77bcf86cd799439011' })
  @IsNotEmpty({ message: 'User ID is required' })
  @IsMongoId({ message: 'Invalid user ID format' })
  userId: string;

  @ApiProperty({
    description: 'OAuth provider',
    enum: AuthProvider,
    example: AuthProvider.GOOGLE,
  })
  @IsNotEmpty({ message: 'Provider is required' })
  @IsEnum(AuthProvider, { message: 'Invalid provider' })
  authProvider: AuthProvider;

  @ApiProperty({ description: 'Provider user ID', example: 'google_123456' })
  @IsNotEmpty({ message: 'Provider user ID is required' })
  @IsString({ message: 'Provider user ID must be a string' })
  providerId: string;

  @ApiProperty({ description: 'Email from provider' })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @ApiPropertyOptional({ description: 'Access token' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Refresh token' })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'ID token' })
  @IsOptional()
  @IsString()
  idToken?: string;
}

/**
 * DTO for updating OAuth account
 */
export class UpdateOAuthAccountDto {
  @ApiPropertyOptional({ description: 'Access token' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Refresh token' })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'ID token' })
  @IsOptional()
  @IsString()
  idToken?: string;
}
