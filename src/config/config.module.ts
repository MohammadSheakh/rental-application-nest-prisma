// configModule import

import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

/**
 * Config Module
 * 
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 * 
 * Global module providing configuration via environment variables
 * with validation
 * 
 * Features:
 * ✅ Global module (available everywhere)
 * ✅ Environment variable validation
 * ✅ Default values
 * ✅ Type safety
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: (config) => {
        // Required variables
        const required = [
          'DATABASE_URL',
          'MONGODB_URI',
          'JWT_ACCESS_SECRET',
          'JWT_REFRESH_SECRET',
          'REDIS_HOST',
        ];
        const missing = required.filter((key) => !config[key]);
        
        if (missing.length > 0) {
          throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        // Validation rules
        if (config.JWT_ACCESS_SECRET && config.JWT_ACCESS_SECRET.length < 32) {
          throw new Error('JWT_ACCESS_SECRET must be at least 32 characters for security');
        }

        if (config.JWT_REFRESH_SECRET && config.JWT_REFRESH_SECRET.length < 32) {
          throw new Error('JWT_REFRESH_SECRET must be at least 32 characters for security');
        }

        if (config.JWT_ACCESS_EXPIRY && !/^\d+[smhd]$/.test(config.JWT_ACCESS_EXPIRY)) {
          throw new Error('JWT_ACCESS_EXPIRY must be in format: number + s/m/h/d (e.g., 15m)');
        }

        if (config.REDIS_PORT && (isNaN(config.REDIS_PORT) || config.REDIS_PORT < 1 || config.REDIS_PORT > 65535)) {
          throw new Error('REDIS_PORT must be a valid port number (1-65535)');
        }

        return config;
      },
    }),
  ],
})
export class ConfigModule {}
