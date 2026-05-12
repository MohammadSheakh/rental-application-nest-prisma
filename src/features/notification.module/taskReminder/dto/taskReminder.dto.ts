import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsMongoId,
  IsEnum,
  IsOptional,
  IsDateString,
  MaxLength,
  IsArray,
  ArrayMinSize,
} from 'class-validator';
import { TaskReminderTrigger, TaskReminderStatus, TaskReminderFrequency } from '../constants/taskReminder.constants';

export class CreateTaskReminderDto {
  @ApiProperty({ description: 'Task ID', example: '507f1f77bcf86cd799439011' })
  @IsNotEmpty({ message: 'Task ID is required' })
  @IsMongoId({ message: 'Invalid task ID format' })
  taskId: string;

  @ApiProperty({ description: 'User ID (recipient)', example: '507f191e810c19729de860ea' })
  @IsNotEmpty({ message: 'User ID is required' })
  @IsMongoId({ message: 'Invalid user ID format' })
  userId: string;

  @ApiProperty({ description: 'Trigger type', enum: TaskReminderTrigger, example: TaskReminderTrigger.SCHEDULED })
  @IsNotEmpty({ message: 'Trigger type is required' })
  @IsEnum(TaskReminderTrigger, { message: 'Invalid trigger type' })
  triggerType: TaskReminderTrigger;

  @ApiProperty({ description: 'Reminder time', example: '2024-04-01T10:00:00Z' })
  @IsNotEmpty({ message: 'Reminder time is required' })
  @IsDateString({}, { message: 'Invalid date format' })
  reminderTime: string;

  @ApiPropertyOptional({ description: 'Custom message', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Message cannot exceed 500 characters' })
  customMessage?: string;

  @ApiPropertyOptional({ description: 'Frequency', enum: TaskReminderFrequency, example: TaskReminderFrequency.ONCE })
  @IsOptional()
  @IsEnum(TaskReminderFrequency, { message: 'Invalid frequency' })
  frequency?: TaskReminderFrequency;

  @ApiPropertyOptional({ description: 'Delivery channels', example: ['in_app', 'email'] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one delivery channel required' })
  @IsString({ each: true })
  deliveryChannels?: string[];
}

export class UpdateTaskReminderDto {
  @ApiPropertyOptional({ description: 'Reminder status', enum: TaskReminderStatus })
  @IsOptional()
  @IsEnum(TaskReminderStatus)
  status?: TaskReminderStatus;

  @ApiPropertyOptional({ description: 'Custom message' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customMessage?: string;

  @ApiPropertyOptional({ description: 'Reminder time' })
  @IsOptional()
  @IsDateString()
  reminderTime?: string;
}
