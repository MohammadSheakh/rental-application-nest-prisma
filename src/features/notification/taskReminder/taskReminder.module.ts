import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TaskReminderController } from './controllers/taskReminder.controller';
import { TaskReminderService } from './services/taskReminder.service';
import { PrismaModule } from '@app/database';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'taskReminders',
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
  ],
  controllers: [TaskReminderController],
  providers: [
    TaskReminderService,
    {
      provide: 'BullQueue_taskReminders',
      useFactory: () => {
        return BullModule.getQueue('taskReminders');
      },
    },
  ],
  exports: [TaskReminderService],
})
export class TaskReminderModule {}
