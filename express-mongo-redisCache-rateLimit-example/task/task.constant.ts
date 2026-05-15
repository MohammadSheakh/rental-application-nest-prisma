/**
 * Task Module Constants
 * Centralized configuration for task-related enums, limits, and defaults
 *
 * @version 1.0.0
 * @author Senior Engineering Team
 */

/**
 * Task Status Enum
 * Represents the current state of a task
 */
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'inProgress',
  COMPLETED = 'completed',
}

/**
 * Task Type Enum
 * Defines the category and assignment style of a task
 */
export enum TaskType {
  PERSONAL = 'personal',
  SINGLE_ASSIGNMENT = 'singleAssignment',
  COLLABORATIVE = 'collaborative',
}

/**
 * Task Priority Enum
 * Determines task urgency and ordering
 */
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Type exports from enums (for MongoDB schema validation and TypeScript)
 */
export type TTaskStatus = `${TaskStatus}`;
export type TTaskType = `${TaskType}`;
export type TTaskPriority = `${TaskPriority}`;

/**
 * Legacy type exports (for backward compatibility)
 * @deprecated Use TaskStatus, TaskType, TaskPriority enums instead
 */
export const T_TASK_STATUS = TaskStatus;
export const T_TASK_TYPE = TaskType;
export const T_TASK_PRIORITY = TaskPriority;

/**
 * Daily Task Limit
 * Maximum number of personal tasks a user can create per day
 * Prevents spam and ensures reasonable task load
 */
export const DAILY_TASK_LIMIT = {
  max: 5,
  message: 'Daily task limit reached',
} as const;

/**
 * Task Cache Configuration
 * TTL values for different task data types
 *
 * @see masterSystemPrompt.md Section 8: Redis Caching Rules
 */

export const TASK_CACHE_CONFIG = {
  // Cache key prefix for all task data
  PREFIX: 'task',
  
  // Task Detail TTL (in seconds)
  DETAIL: 300,              // 5 minutes - individual task details
  LIST: 120,                // 2 minutes - task lists
  
  // Task Statistics TTL
  STATISTICS: 300,          // 5 minutes - task counts by status
  DAILY_PROGRESS: 120,      // 2 minutes - daily progress
  
  // User's Tasks TTL
  USER_TASKS: 180,          // 3 minutes - user's task list
  USER_TASKS_PAGINATED: 120,// 2 minutes - paginated tasks

  // SubTask TTL
  SUBTASK_DETAIL: 300,      // 5 minutes - individual subtask
  SUBTASK_LIST: 180,        // 3 minutes - list of subtasks
  
  // Cache invalidation patterns
  // Updated V2: Removed group-related patterns (group.module removed)
  INVALIDATION_PATTERNS: {
    TASK_CREATED: ['task:list', 'task:statistics', 'task:user:*'],
    TASK_UPDATED: ['task:detail:*', 'task:list', 'task:statistics'],
    TASK_DELETED: ['task:detail:*', 'task:list', 'task:statistics', 'task:user:*'],
    SUBTASK_CREATED: ['task:detail:*', 'subtask:list:*'],
    SUBTASK_UPDATED: ['task:detail:*', 'subtask:detail:*', 'subtask:list:*'],
  },
} as const;

/**
 * Task Rate Limiting Configuration
 * Prevents abuse and ensures fair usage
 * 
 * @see masterSystemPrompt.md Section 10: Rate Limiting Rules
 */
export const TASK_RATE_LIMITS = {
  // Task creation limit per user
  CREATE_TASK: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 20,                    // 20 tasks per hour
    message: 'Too many task creation requests, please try again later',
  },
  
  // Bulk operations limit
  BULK_OPERATION: {
    windowMs: 60 * 1000,       // 1 minute
    max: 5,                     // 5 bulk operations per minute
    message: 'Too many bulk operations, please slow down',
  },
  
  // General task operations limit
  GENERAL: {
    windowMs: 60 * 1000,       // 1 minute
    max: 100,                   // 100 requests per minute
    message: 'Too many requests, please try again later',
  },
  
  // Daily task limit per user (business logic)
  DAILY_LIMIT: {
    max: 50,                    // 50 tasks per day per user
    message: 'You have reached the daily task creation limit',
  },
} as const;

/**
 * Task Queue Configuration
 * BullMQ job settings for async task operations
 * 
 * @see masterSystemPrompt.md Section 9: BullMQ Rules
 */
export const TASK_QUEUE_CONFIG = {
  QUEUE_NAME: 'task-operations',
  
  // Job retry configuration
  JOB_ATTEMPTS: 3,
  BACKOFF_DELAY: 2000,  // 2 seconds
  
  // Job cleanup configuration
  REMOVE_ON_COMPLETE: { count: 100 },
  REMOVE_ON_FAIL: { count: 500 },
  
  // Concurrency limits
  CONCURRENCY: 10,  // Max 10 concurrent task operations
} as const;
