/**
 * TaskReminder Constants
 * Configuration for task reminder system
 *
 * @version 1.0.0 (NestJS Migration)
 * @author Senior Engineering Team
 */

/**
 * Task Reminder Trigger Type Enum
 * When the reminder should be sent
 */
export enum TaskReminderTrigger {
  /** At a specific date/time */
  SCHEDULED = 'scheduled',

  /** Before due date */
  BEFORE_DUE = 'before_due',

  /** After task creation */
  AFTER_CREATION = 'after_creation',

  /** When task is overdue */
  OVERDUE = 'overdue',
}

/**
 * Task Reminder Status Enum
 */
export enum TaskReminderStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Task Reminder Frequency Enum
 */
export enum TaskReminderFrequency {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/**
 * Reminder delivery channels
 */
export const DEFAULT_CHANNELS_BY_TRIGGER: Record<TaskReminderTrigger, string[]> = {
  [TaskReminderTrigger.SCHEDULED]: ['in_app', 'email'],
  [TaskReminderTrigger.BEFORE_DUE]: ['in_app', 'push'],
  [TaskReminderTrigger.AFTER_CREATION]: ['in_app'],
  [TaskReminderTrigger.OVERDUE]: ['in_app', 'email', 'push'],
};

/**
 * Reminder limits and constraints
 */
export const TASK_REMINDER_LIMITS = {
  /** Maximum reminders per task */
  MAX_REMINDERS_PER_TASK: 5,

  /** Maximum custom message length */
  MAX_CUSTOM_MESSAGE_LENGTH: 500,

  /** Minimum advance time for reminder (minutes) */
  MIN_ADVANCE_MINUTES: 5,

  /** Maximum advance time for reminder (days) */
  MAX_ADVANCE_DAYS: 30,
} as const;

/**
 * BullMQ queue configuration
 */
export const REMINDER_QUEUE_CONFIG = {
  QUEUE_NAME: 'taskReminders',
  JOB_ATTEMPTS: 3,
  BACKOFF_DELAY: 5000,
  REMOVE_ON_COMPLETE: { count: 100 },
  REMOVE_ON_FAIL: { count: 500 },
} as const;

/**
 * Export legacy constants
 */
export const TaskReminderTriggerType = TaskReminderTrigger;
export const TaskReminderStatusType = TaskReminderStatus;
export const TaskReminderFrequencyType = TaskReminderFrequency;
