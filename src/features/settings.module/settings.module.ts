import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Settings, SettingsSchema } from './schemas/settings.schema';
import { SettingsController } from './controllers/settings.controller';
import { SettingsService } from './services/settings.service';

/**
 * Settings Module
 * Handles static content management (About Us, Privacy Policy, etc.)
 *
 * @version 1.0.0 (NestJS Migration)
 * @author Senior Engineering Team
 */
@Module({
  imports: [
     // MongooseModule.forFeature([
      {
        name: Settings.name,
        schema: SettingsSchema,
      },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [
     // MongooseModule.forFeature([
      {
        name: Settings.name,
        schema: SettingsSchema,
      },
    ]),
    SettingsService,
  ],
})
export class SettingsModule {}
