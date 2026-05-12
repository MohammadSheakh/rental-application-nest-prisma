import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { SocketGateway } from './socket.gateway';
import { SocketAuthService } from './services/socket-auth.service';
import { SocketRoomService } from './services/socket-room.service';
import { RedisModule } from '../../helpers/redis/redis.module';

/**
 * Socket Module
 *
 * 📚 REAL-TIME WEBSOCKET MODULE
 *
 * Features:
 * - Socket.IO Gateway with 20+ events
 * - JWT Authentication for WebSocket
 * - Room Management (chat, tasks, family)
 * - Online User Tracking
 * - Real-time Notifications
 * - Redis Adapter for Multi-Worker
 *
 * Compatible with Express.js socket/socketForChatV3.ts
 *
 * Events (Client → Server):
 * - 'join' - Join conversation room
 * - 'leave' - Leave conversation room
 * - 'join-task' - Join task room
 * - 'leave-task' - Leave task room
 * - 'send-message' - Send chat message
 * - 'get-online-users' - Get related online users
 *
 * Events (Server → Client):
 * - 'notification::userId' - New notification
 * - 'notification:unread-count::userId' - Unread count update
 * - 'user-joined-chat' - User joined conversation
 * - 'user-left-chat' - User left conversation
 * - 'new-message-received' - New message received
 * - 'user-joined-task' - User joined task
 * - 'user-left-task' - User left task
 * - 'task-status-updated' - Task status changed
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'fallback-secret',
      signOptions: { expiresIn: '7d' },
    }),
    RedisModule,
  ],
  providers: [
    SocketGateway,
    SocketAuthService,
    SocketRoomService,
  ],
  exports: [
    SocketGateway,
    SocketAuthService,
    SocketRoomService,
  ],
})
export class SocketModule {}
