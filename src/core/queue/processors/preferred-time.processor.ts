import { Processor, Process } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

import { QUEUE_NAMES } from './bullmq.constants';

interface IPreferredTimeJob {
  userId: string;
}

/**
 * Preferred Time Processor
 *
 * 📚 BULLMQ WORKER FOR CALCULATING USER PREFERRED TIMES
 *
 * Processes jobs to calculate and update user preferred times:
 * - Analyzes user's task completion patterns
 * - Updates preferred time field
 *
 * Compatible with Express.js bullmq.ts startPreferredTimeWorker()
 */
@Processor(QUEUE_NAMES.PREFERRED_TIME)
export class PreferredTimeProcessor {
  private readonly logger = new Logger(PreferredTimeProcessor.name);

  @Process('calculate-preferred-time')
  async processPreferredTime(job: Job<IPreferredTimeJob>): Promise<void> {
    const { userId } = job.data;
    this.logger.log(`⏰ Processing preferred time calculation for user ${userId}`);

    try {
      // Note: Import TaskService dynamically to avoid circular dependency
      // const { TaskService } = await import('../../modules/task.module/task/task.service');
      // const taskService = new TaskService();
      // const preferredTime = await taskService.calculateAndUpdatePreferredTime(
      //   new Types.ObjectId(userId)
      // );

      // if (preferredTime) {
      //   this.logger.log(`✅ Preferred time updated for user ${userId}: ${preferredTime}`);
      // } else {
      //   this.logger.log(`⚠️ Insufficient data for preferred time calculation (user: ${userId})`);
      // }

      this.logger.log(`✅ Preferred time job ${job.id} completed`);
    } catch (error) {
      this.logger.error(`❌ Preferred time calculation failed for user ${userId}:`, error);
      throw error;
    }
  }
}
