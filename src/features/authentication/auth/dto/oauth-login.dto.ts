import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * OAuth Provider Enum
 */
export enum OAuthProvider {
  GOOGLE = 'google',
  APPLE = 'apple',
}

/**
 * OAuth Login DTO
 * For Google/Apple social login
 */
export class OAuthLoginDto {
  @ApiProperty({
    example: 'google',
    description: 'OAuth provider',
    enum: OAuthProvider,
  })
  @IsEnum(OAuthProvider, { message: 'Provider must be google or apple' })
  @IsNotEmpty({ message: 'Provider is required' })
  provider: OAuthProvider;

  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjFlOWdkazcifQ...',
    description: 'ID token from OAuth provider',
  })
  @IsString()
  @IsNotEmpty({ message: 'ID token is required' })
  idToken: string;

  @ApiProperty({
    example: 'business',
    description: 'User role (for new registrations)',
    required: false,
  })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiProperty({
    example: 'fcm-token-123456',
    description: 'FCM token for push notifications',
    required: false,
  })
  @IsString()
  @IsOptional()
  fcmToken?: string;
}
