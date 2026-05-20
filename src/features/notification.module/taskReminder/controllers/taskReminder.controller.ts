import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TaskReminderService } from './services/taskReminder.service';
import { CreateTaskReminderDto, UpdateTaskReminderDto } from './dto/taskReminder.dto';
import { TaskReminderStatus } from '../constants/taskReminder.constants';
import { AuthGuard, RolesGuard, Roles, User } from '@app/common';
import { Throttle } from '@nestjs/throttler';

@Controller('task-reminders')
@ApiTags('Task Reminders')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, RolesGuard)
export class TaskReminderController {
  constructor(private readonly taskReminderService: TaskReminderService) {}

  @Post()
  @ApiOperation({ summary: 'Create task reminder' })
  @ApiResponse({ status: 201, description: 'Reminder created successfully' })
  @Throttle(10, 60)
  async createReminder(@Body() dto: CreateTaskReminderDto, @User() user: any) {
    const result = await this.taskReminderService.createReminder(dto, user.userId);
    return { success: true, data: result, message: 'Reminder created successfully' };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get reminder by ID' })
  @ApiResponse({ status: 200, description: 'Reminder retrieved' })
  @Throttle(100, 60)
  async getReminder(@Param('id') id: string) {
    const result = await this.taskReminderService.getReminderById(id);
    if (!result) {
      return { success: false, message: 'Reminder not found' };
    }
    return { success: true, data: result };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get user reminders' })
  @ApiQuery({ name: 'status', required: false, enum: TaskReminderStatus })
  @ApiResponse({ status: 200, description: 'Reminders retrieved' })
  @Throttle(100, 60)
  async getUserReminders(
    @Param('userId') userId: string,
    @Query('status') status?: TaskReminderStatus,
  ) {
    const result = await this.taskReminderService.getUserReminders(userId, status);
    return { success: true, data: result };
  }

  @Get('task/:taskId')
  @ApiOperation({ summary: 'Get task reminders' })
  @ApiResponse({ status: 200, description: 'Reminders retrieved' })
  @Throttle(100, 60)
  async getTaskReminders(@Param('taskId') taskId: string) {
    const result = await this.taskReminderService.getTaskReminders(taskId);
    return { success: true, data: result };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel reminder' })
  @ApiResponse({ status: 200, description: 'Reminder cancelled' })
  @Throttle(10, 60)
  async cancelReminder(@Param('id') id: string) {
    const result = await this.taskReminderService.cancelReminder(id);
    return { success: true, data: result, message: 'Reminder cancelled successfully' };
  }
}
