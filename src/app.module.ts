import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { RedisModule } from '@app/redis';
import { AuthModule } from './features/authentication/auth.module';
import { UserModule } from './features/user-management/user.module';
import { AttachmentModule } from './features/attachments/attachment.module';
import { PrismaModule } from '@app/database';
import { BullMQModule } from '@app/queue';
import { ChattingModule } from './features/chatting/chatting.module';
import { NotificationModule } from './features/notification/notification.module';
import { FirebaseModule } from '@app/notification';

/**
 * Application Root Module
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    BullMQModule,
    FirebaseModule,

    AuthModule,
    UserModule,
    AttachmentModule,
    NotificationModule,
    ChattingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
