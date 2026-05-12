import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TaskReminderTrigger, TaskReminderStatus, TaskReminderFrequency, TASK_REMINDER_LIMITS } from '../constants/taskReminder.constants';

/**
 * TaskReminder Schema
 * Represents a scheduled reminder for a task
 */
@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class TaskReminder {
  @Prop({
    type: Schema.Types.ObjectId,
    ref: 'Task',
    required: [true, 'Task is required'],
    index: true,
  })
  taskId: Types.ObjectId;

  @Prop({
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required'],
  })
  createdByUserId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(TaskReminderTrigger),
    required: [true, 'Trigger type is required'],
  })
  triggerType: TaskReminderTrigger;

  @Prop({
    type: Date,
    required: [true, 'Reminder time is required'],
    index: true,
  })
  reminderTime: Date;

  @Prop({
    type: String,
    trim: true,
    maxlength: [TASK_REMINDER_LIMITS.MAX_CUSTOM_MESSAGE_LENGTH, 'Message too long'],
  })
  customMessage?: string;

  @Prop({
    type: String,
    enum: Object.values(TaskReminderStatus),
    default: TaskReminderStatus.PENDING,
    index: true,
  })
  status: TaskReminderStatus;

  @Prop({
    type: String,
    enum: Object.values(TaskReminderFrequency),
    default: TaskReminderFrequency.ONCE,
  })
  frequency: TaskReminderFrequency;

  @Prop({
    type: [String],
    default: ['in_app', 'email'],
  })
  deliveryChannels: string[];

  @Prop({ default: 0 })
  sentCount: number;

  @Prop()
  lastSentAt?: Date;

  @Prop()
  nextReminderTime?: Date;

  @Prop({ type: Schema.Types.Mixed, default: null })
  bullJobId?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TaskReminderSchema = SchemaFactory.createForClass(TaskReminder);

// Indexes
TaskReminderSchema.index({ userId: 1, status: 1, isDeleted: 1 });
TaskReminderSchema.index({ taskId: 1, isDeleted: 1 });
TaskReminderSchema.index({ reminderTime: 1, status: 1 });

// Virtual populate
TaskReminderSchema.virtual('task', {
  ref: 'Task',
  localField: 'taskId',
  foreignField: '_id',
  justOne: true,
});

TaskReminderSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

TaskReminderSchema.virtual('creator', {
  ref: 'User',
  localField: 'createdByUserId',
  foreignField: '_id',
  justOne: true,
});

// toJSON transformation
TaskReminderSchema.set('toJSON', {
  transform: function (doc, ret, options) {
    ret.taskReminderId = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.isDeleted;
    return ret;
  },
});

// Static methods
TaskReminderSchema.statics.countRemindersForTask = async function (taskId: Types.ObjectId): Promise<number> {
  return this.countDocuments({ taskId, isDeleted: false });
};

TaskReminderSchema.statics.findPendingReminders = async function (userId: Types.ObjectId): Promise<TaskReminderDocument[]> {
  return this.find({ userId, status: TaskReminderStatus.PENDING, isDeleted: false });
};

export type TaskReminderDocument = TaskReminder & Document;
export type TaskReminderModel = typeof TaskReminder;
