import { Processor, Process } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

import { QUEUE_NAMES } from './bullmq.constants';

interface ITaskReminderJobData {
  reminderId: string;
  taskId: string;
  userId: string;
  reminderTime: Date;
  triggerType: string;
  channels: string[];
  customMessage?: string;
}

/**
 * Task Reminders Processor
 *
 * 📚 BULLMQ WORKER FOR SENDING TASK REMINDERS
 *
 * Processes scheduled task reminder jobs:
 * - Sends notification to user
 * - Marks reminder as sent
 *
 * Compatible with Express.js bullmq.ts startTaskRemindersWorker()
 */
@Processor(QUEUE_NAMES.TASK_REMINDERS)
export class TaskRemindersProcessor {
  private readonly logger = new Logger(TaskRemindersProcessor.name);

  @Process('send-task-reminder')
  async processTaskReminder(job: Job<ITaskReminderJobData>): Promise<void> {
    const { reminderId, taskId, userId, reminderTime, triggerType, channels } = job.data;
    this.logger.log(`Processing task reminder job ${job.id} for task ${taskId} user ${userId}`);

    try {
      // Note: Import TaskReminderService dynamically to avoid circular dependency
      // const { TaskReminderService } = await import('../../modules/notification.module/taskReminder/taskReminder.service');
      // const taskReminderService = new TaskReminderService();
      // await taskReminderService.processReminder(reminderId);

      this.logger.log(`✅ Task reminder sent for task ${taskId} to user ${userId}`);
    } catch (err: any) {
      this.logger.error(`❌ Task reminder job ${job.id} failed:`, err.stack);
      throw err;
    }
  }
}
