
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
// import { DatabaseModule } from './core/database/mongo/mongodb.module';
import { RedisModule } from './core/database/redis/redis.module';
import { AuthModule } from './features/authentication/auth.module';
import { UserModule } from './features/user-management/user.module';
import { PrismaModule } from './core/database/prisma/prisma.module';


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
    // DatabaseModule,    // MongoDB connection
    PrismaModule,
    RedisModule,       // Redis connection
    // BullMQModule,      // ⭐ BullMQ queues (5 queues)
    // SocketModule,      // ⭐ Socket.IO gateway (real-time)

    // ──────────────────────────────────────────────────────────────────────
    // Feature Modules
    // ──────────────────────────────────────────────────────────────────────

    AuthModule,                    // Authentication & Authorization
    UserModule,                    // User management
    
    // AttachmentModule,              // File attachments
    // NotificationModule,            // ⭐ Generic notifications
    // ChattingModule,                // ⭐ Chat messaging (NEW)

    // ──────────────────────────────────────────────────────────────────────
    // Future Modules (to be added)
    // ──────────────────────────────────────────────────────────────────────

    // SubscriptionModule,         // Subscriptions
    // PaymentModule,              // Payments
  ],
})
export class AppModule {}
