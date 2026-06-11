import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { RedisModule } from '@app/redis';
import { AuthModule } from './features/authentication/auth.module';
import { UserModule } from './features/user-management/user.module';
import { PrismaModule } from '@app/database';
import { BullMQModule } from '@app/queue';
import { SettingsModule } from './features/settings/settings.module';

/**
 * Application Root Module
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    BullMQModule,

    AuthModule,
    UserModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
