import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '@app/database';
import { CreateTaskReminderDto, UpdateTaskReminderDto } from '../dto/taskReminder.dto';

@Injectable()
export class TaskReminderService {
  private readonly logger = new Logger(TaskReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('BullQueue_taskReminders') private readonly reminderQueue: Queue,
  ) {}

  /**
   * Create a new task reminder
   */
  async createReminder(dto: CreateTaskReminderDto, creatorId: string) {
    const reminder = await this.prisma.taskReminder.create({
      data: {
        taskId: dto.taskId,
        userId: dto.userId,
        createdByUserId: creatorId,
        triggerType: dto.triggerType as any,
        reminderTime: new Date(dto.reminderTime),
        customMessage: dto.customMessage,
        frequency: (dto.frequency || 'once') as any,
        deliveryChannels: dto.deliveryChannels || ['in_app'],
      },
    });

    // Schedule BullMQ job
    const delay = new Date(dto.reminderTime).getTime() - Date.now();
    if (delay > 0) {
      const job = await this.reminderQueue.add(
        'process-reminder',
        { reminderId: reminder.id },
        { delay, removeOnComplete: true }
      );
      
      await this.prisma.taskReminder.update({
        where: { id: reminder.id },
        data: { bullJobId: job.id as string }
      });
    }

    return reminder;
  }

  /**
   * Get user's active reminders
   */
  async getActiveReminders(userId: string) {
    return this.prisma.taskReminder.findMany({
      where: { userId, status: 'pending', isDeleted: false },
      orderBy: { reminderTime: 'asc' },
    });
  }

  /**
   * Cancel reminder
   */
  async cancelReminder(reminderId: string, userId: string) {
    const reminder = await this.prisma.taskReminder.findFirst({
      where: { id: reminderId, userId },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    if (reminder.bullJobId) {
      const job = await this.reminderQueue.getJob(reminder.bullJobId);
      if (job) await job.remove();
    }

    return this.prisma.taskReminder.update({
      where: { id: reminderId },
      data: { status: 'cancelled' },
    });
  }

  /**
   * Delete reminder
   */
  async deleteReminder(reminderId: string, userId: string) {
    await this.cancelReminder(reminderId, userId);
    return this.prisma.taskReminder.update({
      where: { id: reminderId },
      data: { isDeleted: true },
    });
  }
}
