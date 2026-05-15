//@ts-ignore
import express from 'express';
import { TaskController } from './task.controller';
import { ITask } from './task.interface';
import { validateFiltersForQuery } from '../../../middlewares/queryValidation/paginationQueryValidationMiddleware';
import validateRequest from '../../../shared/validateRequest';
import auth from '../../../middlewares/auth';
import { TRole } from '../../../middlewares/roles';
import { setQueryOptions } from '../../../middlewares/setQueryOptions';
import { getLoggedInUserAndSetReferenceToUser } from '../../../middlewares/getLoggedInUserAndSetReferenceToUser';
import * as validation from './task.validation';
import { verifyTaskAccess, verifyTaskOwnership, validateTaskTypeConsistency, validateStatusTransition, checkDailyTaskLimit, checkSecondaryUserPermission } from './task.middleware';
import { rateLimiter } from '../../../middlewares/rateLimiterRedis';
import { SubTaskRoute } from '../subTask/subTask.route';

const router = express.Router();

// ─── Rate Limiters ─────────────────────────────────────────────────────
/**
 * Rate limiters using centralized rateLimiter with Redis
 * All rate limits are shared across server instances via Redis
 */
const createTaskLimiter = rateLimiter('user');  // 30 req/min
const taskLimiter = rateLimiter('user');        // 30 req/min

export const optionValidationChecking = <T extends keyof ITask | 'sortBy' | 'page' | 'limit' | 'populate' | 'status' | 'taskType' | 'priority' | 'from' | 'to'>(
  filters: T[]
) => {
  return filters;
};

const paginationOptions: Array<'sortBy' | 'page' | 'limit' | 'populate'> = [
  'sortBy',
  'page',
  'limit',
  'populate',
];

const controller = new TaskController();


/*-───────────────────────────────── ✔️
|  Child (Secondary) | Business | Task | edit-update-task-flow.png | Create a new task
|  @desc Create personal, single assignment, or collaborative task
|  @auth Business users always allowed
|  @auth Child users need Secondary User permission
|  @rateLimit 20 requests per hour (prevents spam)
|  @permission Only Secondary User children can create tasks
└──────────────────────────────────*/
router.route('/').post(
  auth(TRole.commonUser),
  createTaskLimiter,
  checkSecondaryUserPermission,  // ⬅️ NEW: Check Secondary User status
  validateRequest(validation.createTaskValidationSchema),
  validateTaskTypeConsistency,
  checkDailyTaskLimit,
  controller.create
);



/*-─────────────────────────────────✔️
|  Child | Business | Task | home-flow.png | Get all my tasks with pagination
|  @desc Paginated list of tasks with advanced filtering
|  @auth All authenticated users (child, business)
|  @rateLimit 100 requests per minute
└──────────────────────────────────*/
router.route('/paginate').get(
  auth(TRole.commonUser),
  taskLimiter,
  validateFiltersForQuery(optionValidationChecking(['status', 'taskType', 'priority', 'from', 'to', ...paginationOptions])),
  setQueryOptions({
    populate: [
      { path: 'createdById', select: 'name email profileImage' },
      { path: 'ownerUserId', select: 'name email profileImage' },
      { path: 'assignedUserIds', select: 'name email profileImage' },
    ],
  }),
  controller.getMyTasksWithPagination
);

/*-───────────────────────────────── ✔️
|  Child | Business | Task | status-section-flow-01.png | Get task statistics
|  @desc Get count of tasks by status (pending, inProgress, completed)
|  @auth All authenticated users (child, business)
|  @rateLimit 100 requests per minute
└──────────────────────────────────*/
router.route('/statistics').get(
  auth(TRole.commonUser),
  taskLimiter,
  controller.getStatistics
);



export const TaskRoute = router;
