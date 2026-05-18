import { Module, Global, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { SocketGateway } from './socket.gateway';
import { SocketAuthService } from './services/socket-auth.service';
import { SocketRoomService } from './services/socket-room.service';
import { RedisModule } from '../../core/database/redis/redis.module';
import { PrismaModule } from '../../core/database/prisma/prisma.module';
import { ConversationParticipents, ConversationParticipentsSchema } from '../chatting.module/conversationParticipents/conversationParticipents.schema';
import { ChattingModule } from '../chatting.module/chatting.module';

/**
 * Socket Module
 *
 * 📚 REAL-TIME WEBSOCKET MODULE
 */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'fallback-secret',
      signOptions: { expiresIn: '7d' },
    }),
    MongooseModule.forFeature([
      {
        name: ConversationParticipents.name,
        schema: ConversationParticipentsSchema,
      },
    ]),
    RedisModule,
    PrismaModule,
    forwardRef(() => ChattingModule),
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
