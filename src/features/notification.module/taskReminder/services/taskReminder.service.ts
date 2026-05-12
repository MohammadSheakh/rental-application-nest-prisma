import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskReminder, TaskReminderDocument } from './schemas/taskReminder.schema';
import { TaskReminderStatus, TASK_REMINDER_LIMITS } from '../constants/taskReminder.constants';
import { CreateTaskReminderDto } from './dto/taskReminder.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Task, TaskDocument } from '../../task.module/task/task.schema';

/**
 * TaskReminder Service
 * Handles task reminder operations with BullMQ integration
 */
@Injectable()
export class TaskReminderService {
  private readonly logger = new Logger(TaskReminderService.name);

  constructor(
    @InjectModel(TaskReminder.name)
    private taskReminderModel: Model<TaskReminderDocument>,

    @InjectModel(Task.name)
    private taskModel: Model<TaskDocument>,

    @InjectQueue('taskReminders')
    private taskRemindersQueue: Queue,
  ) {}

  /**
   * Create a task reminder
   */
  async createReminder(dto: CreateTaskReminderDto, createdByUserId: string): Promise<TaskReminderDocument> {
    this.logger.log(`Creating reminder for task ${dto.taskId}`);

    // Verify task exists
    const task = await this.taskModel.findById(dto.taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check reminder limit
    const existingCount = await this.taskReminderModel.countDocuments({
      taskId: new Types.ObjectId(dto.taskId),
      isDeleted: false,
    });

    if (existingCount >= TASK_REMINDER_LIMITS.MAX_REMINDERS_PER_TASK) {
      throw new BadRequestException(
        `Maximum ${TASK_REMINDER_LIMITS.MAX_REMINDERS_PER_TASK} reminders allowed per task`,
      );
    }

    // Validate reminder time is in future
    const reminderTime = new Date(dto.reminderTime);
    if (reminderTime <= new Date()) {
      throw new BadRequestException('Reminder time must be in the future');
    }

    // Create reminder
    const reminder = await this.taskReminderModel.create({
      taskId: new Types.ObjectId(dto.taskId),
      userId: new Types.ObjectId(dto.userId),
      createdByUserId: new Types.ObjectId(createdByUserId),
      triggerType: dto.triggerType,
      reminderTime,
      customMessage: dto.customMessage,
      frequency: dto.frequency || 'once',
      deliveryChannels: dto.deliveryChannels || ['in_app', 'email'],
      status: TaskReminderStatus.PENDING,
      sentCount: 0,
    });

    // Schedule BullMQ job
    try {
      const job = await this.taskRemindersQueue.add(
        'processTaskReminder',
        {
          reminderId: reminder._id.toString(),
          taskId: reminder.taskId.toString(),
          userId: reminder.userId.toString(),
          reminderTime: reminder.reminderTime.toISOString(),
          triggerType: reminder.triggerType,
        },
        {
          delay: reminderTime.getTime() - Date.now(),
          jobId: `reminder:${reminder._id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      );

      reminder.bullJobId = job.id;
      await reminder.save();

      this.logger.log(`Scheduled BullMQ job ${job.id} for reminder ${reminder._id}`);
    } catch (error) {
      this.logger.error(`Failed to schedule BullMQ job: ${error.message}`);
      // Don't fail - reminder is still created
    }

    return reminder;
  }

  /**
   * Get reminder by ID
   */
  async getReminderById(id: string): Promise<TaskReminderDocument | null> {
    return this.taskReminderModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    }).populate('task user creator');
  }

  /**
   * Get all reminders for a user
   */
  async getUserReminders(userId: string, status?: TaskReminderStatus): Promise<TaskReminderDocument[]> {
    const query: any = { userId: new Types.ObjectId(userId), isDeleted: false };
    if (status) {
      query.status = status;
    }
    return this.taskReminderModel.find(query).populate('task').sort({ reminderTime: -1 });
  }

  /**
   * Get all reminders for a task
   */
  async getTaskReminders(taskId: string): Promise<TaskReminderDocument[]> {
    return this.taskReminderModel.find({
      taskId: new Types.ObjectId(taskId),
      isDeleted: false,
    }).populate('user creator');
  }

  /**
   * Cancel a reminder
   */
  async cancelReminder(id: string): Promise<TaskReminderDocument> {
    const reminder = await this.taskReminderModel.findById(id);
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    reminder.status = TaskReminderStatus.CANCELLED;
    await reminder.save();

    // Remove from BullMQ queue
    try {
      if (reminder.bullJobId) {
        await this.taskRemindersQueue.remove(reminder.bullJobId);
        this.logger.log(`Removed BullMQ job ${reminder.bullJobId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to remove BullMQ job: ${error.message}`);
    }

    return reminder;
  }

  /**
   * Mark reminder as sent
   */
  async markAsSent(id: string): Promise<TaskReminderDocument> {
    const reminder = await this.taskReminderModel.findById(id);
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    reminder.status = TaskReminderStatus.SENT;
    reminder.sentCount += 1;
    reminder.lastSentAt = new Date();
    await reminder.save();

    return reminder;
  }

  /**
   * Mark reminder as failed
   */
  async markAsFailed(id: string, errorMessage?: string): Promise<TaskReminderDocument> {
    const reminder = await this.taskReminderModel.findById(id);
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    reminder.status = TaskReminderStatus.FAILED;
    await reminder.save();

    this.logger.error(`Reminder ${id} failed: ${errorMessage}`);
    return reminder;
  }

  /**
   * Delete reminder (soft delete)
   */
  async deleteReminder(id: string): Promise<TaskReminderDocument> {
    const reminder = await this.taskReminderModel.findById(id);
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    reminder.isDeleted = true;
    await reminder.save();

    // Remove from queue
    try {
      if (reminder.bullJobId) {
        await this.taskRemindersQueue.remove(reminder.bullJobId);
      }
    } catch (error) {
      // Ignore queue errors
    }

    return reminder;
  }
}
