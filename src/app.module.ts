import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// @Module({
//   imports: [],
//   controllers: [AppController],
//   providers: [AppService],
// })
// export class AppModule {}


import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './helpers/redis/redis.module';
import { BullMQModule } from './helpers/bullmq/bullmq.module';
import { SocketModule } from './modules/socket.gateway/socket.module';
import { AuthModule } from './modules/auth.module/auth.module';
import { UserModule } from './modules/user.module/user.module';
import { TaskModule } from './modules/task.module/task.module';
import { ChildrenBusinessUserModule } from './modules/childrenBusinessUser.module/childrenBusinessUser.module';
import { AttachmentModule } from './modules/attachment.module/attachment.module';
import { NotificationModule } from './modules/notification.module/notification.module';
import { ChattingModule } from './modules/chatting.module/chatting.module';

/**
 * Application Root Module
 *
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 *
 * Imports and configures all application modules
 *
 * Module Dependency Graph:
 *
 * AppModule
 * ├── ConfigModule (Global)
 * ├── DatabaseModule (Global)
 * ├── RedisModule (Global)
 * ├── BullMQModule (Global) ⭐
 * ├── SocketModule (Global) ⭐
 * ├── AuthModule
 * ├── UserModule
 * ├── TaskModule
 * ├── ChildrenBusinessUserModule
 * ├── AttachmentModule
 * ├── NotificationModule ⭐
 * └── ChattingModule ⭐ NEW
 */
@Module({
  imports: [
    // ──────────────────────────────────────────────────────────────────────
    // Infrastructure Modules (Global)
    // ──────────────────────────────────────────────────────────────────────

    ConfigModule,      // Environment configuration
    DatabaseModule,    // MongoDB connection
    RedisModule,       // Redis connection
    BullMQModule,      // ⭐ BullMQ queues (5 queues)
    SocketModule,      // ⭐ Socket.IO gateway (real-time)

    // ──────────────────────────────────────────────────────────────────────
    // Feature Modules
    // ──────────────────────────────────────────────────────────────────────

    AuthModule,                    // Authentication & Authorization
    UserModule,                    // User management
    TaskModule,                    // Task management
    ChildrenBusinessUserModule,    // Parent-child relationships
    AttachmentModule,              // File attachments
    NotificationModule,            // ⭐ Generic notifications
    ChattingModule,                // ⭐ Chat messaging (NEW)

    // ──────────────────────────────────────────────────────────────────────
    // Future Modules (to be added)
    // ──────────────────────────────────────────────────────────────────────

    // AnalyticsModule,            // Analytics & charts
    // TaskProgressModule,         // Task progress tracking
    // SubscriptionModule,         // Subscriptions
    // PaymentModule,              // Payments
  ],
})
export class AppModule {}
