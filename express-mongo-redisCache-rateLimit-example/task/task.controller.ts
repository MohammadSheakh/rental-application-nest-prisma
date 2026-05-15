import { Request, Response } from 'express'; // test
import { StatusCodes } from 'http-status-codes';
import { GenericController } from '../../_generic-module/generic.controller';
import { Task } from './task.model';
import { ITask } from './task.interface';
import { TaskService } from './task.service';
import { TRole } from '../../../middlewares/roles';
import ApiError from '../../../errors/ApiError';
// ❌ REMOVED: GroupMember not needed (using checkSecondaryUserPermission instead)
// import { GroupMember } from '../../group.module/groupMember/groupMember.model';
import { SubTaskService } from '../subTask/subTask.service';
import { logger, errorLogger } from '../../../shared/logger';
import { Types } from 'mongoose';
import sendResponse from '../../../shared/sendResponse';

/**
 * Task Controller
 * Handles HTTP requests for task operations
 * Extends GenericController for standard CRUD operations
 */
export class TaskController extends GenericController<typeof Task, ITask> {
  taskService: TaskService;
  subTaskService: SubTaskService;

  constructor() {
    super(new TaskService(), 'Task');
    this.taskService = new TaskService();
    this.subTaskService = new SubTaskService();
  }
  
  /** ✔️
   * Get all tasks for the logged-in user with pagination
   */
  getMyTasksWithPagination = async (req: Request, res: Response) => {
    const userId = req.user?.userId;

    if (!userId) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'User not authenticated');
    }

    const filters = req.query;
    const options = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      sortBy: req.query.sortBy as string || '-startTime',
    };

    const result = await this.taskService.getUserTasksWithPagination(
      userId,
      filters,
      options
    );

    sendResponse(res, {
      code: StatusCodes.OK,
      data: result,
      message: 'Tasks retrieved successfully with pagination',
      success: true,
    });
  };

  /** ✔️
   * Get task statistics for the logged-in user
   */
  getStatistics = async (req: Request, res: Response) => {
    const userId = req.user?.userId;

    if (!userId) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'User not authenticated');
    }

    const result = await this.taskService.getTaskStatistics(userId);

    sendResponse(res, {
      code: StatusCodes.OK,
      data: result,
      message: 'Task statistics retrieved successfully',
      success: true,
    });
  };

  
}
