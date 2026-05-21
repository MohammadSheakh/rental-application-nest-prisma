import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TaskReminderService } from '../services/taskReminder.service';
import { CreateTaskReminderDto } from '../dto/taskReminder.dto';
import { AuthGuard, User } from '@app/common';

@ApiTags('Task Reminders')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('task-reminders')
export class TaskReminderController {
  constructor(private readonly taskReminderService: TaskReminderService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task reminder' })
  @ApiResponse({ status: 201, description: 'Reminder created successfully' })
  async createReminder(
    @Body() dto: CreateTaskReminderDto,
    @User('userId') userId: string,
  ) {
    return await this.taskReminderService.createReminder(dto, userId);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my active reminders' })
  @ApiResponse({ status: 200, description: 'Reminders retrieved successfully' })
  async getMyReminders(@User('userId') userId: string) {
    return await this.taskReminderService.getActiveReminders(userId);
  }

  @Delete(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a reminder' })
  async cancelReminder(
    @Param('id') id: string,
    @User('userId') userId: string,
  ) {
    await this.taskReminderService.cancelReminder(id, userId);
    return { message: 'Reminder cancelled successfully' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a reminder' })
  async deleteReminder(
    @Param('id') id: string,
    @User('userId') userId: string,
  ) {
    await this.taskReminderService.deleteReminder(id, userId);
    return { message: 'Reminder deleted successfully' };
  }
}
