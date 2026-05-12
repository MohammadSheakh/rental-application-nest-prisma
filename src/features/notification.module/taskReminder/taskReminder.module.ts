import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { TaskReminder, TaskReminderSchema } from './schemas/taskReminder.schema';
import { Task, TaskSchema } from '../../task.module/task/task.schema';
import { TaskReminderController } from './controllers/taskReminder.controller';
import { TaskReminderService } from './services/taskReminder.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaskReminder.name, schema: TaskReminderSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    BullModule.registerQueue({
      name: 'taskReminders',
    }),
  ],
  controllers: [TaskReminderController],
  providers: [TaskReminderService],
  exports: [TaskReminderService],
})
export class TaskReminderModule {}
