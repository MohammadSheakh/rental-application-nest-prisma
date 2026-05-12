import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { GenericController } from '../../../common/generic/generic.controller';
import { UserService } from './user.service';
import { User } from './user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { UserPayload } from '../../../common/decorators/user.decorator';
import { TransformResponseInterceptor } from '../../../common/interceptors/transform-response.interceptor';

/**
 * User Controller
 * 
 * 📚 EXPRESS → NESTJS TRANSITION
 * 
 * Express Pattern:
 * - class UserController extends GenericController<typeof User, IUser>
 * - constructor() { super(new UserService(), 'User'); }
 * - Manual route decorators
 * 
 * NestJS Pattern:
 * - @Controller() decorator
 * - Extend generic controller
 * - @UseGuards() for authentication
 * - @User() decorator for user payload
 * 
 * Key Benefits:
 * ✅ Automatic CRUD endpoints
 * ✅ Easy to add custom endpoints
 * ✅ Swagger documentation
 * ✅ Type-safe operations
 */
@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard)
@UseInterceptors(TransformResponseInterceptor)
@ApiBearerAuth()
export class UserController extends GenericController<typeof User, UserDocument> {
  constructor(private userService: UserService) {
    super(userService, 'User');
  }

  /**
   * GET /users/profile
   * Get current user profile
   */
  @Get('profile')
  @ApiOperation({ 
    summary: 'Get my profile',
    description: 'Get current authenticated user profile with statistics',
  })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getProfile(@UserPayload() user: UserPayload) {
    const userProfile = await this.userService.findByIdWithCache(user.userId);
    
    if (!userProfile) {
      throw new NotFoundException('User not found');
    }

    // Get user statistics
    const statistics = await this.userService.getUserStatistics(user.userId);

    return {
      ...userProfile,
      statistics,
    };
  }

  /**
   * PUT /users/profile
   * Update current user profile
   */
  @Put('profile')
  @ApiOperation({ 
    summary: 'Update my profile',
    description: 'Update current authenticated user profile information',
  })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @UserPayload() user: UserPayload,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const updatedUser = await this.userService.updateById(
      user.userId,
      updateProfileDto,
    );

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    // Invalidate cache
    await this.userService.invalidateCache(user.userId);

    return updatedUser;
  }

  /**
   * PUT /users/preferred-time
   * Update user's preferred time for task scheduling
   */
  @Put('preferred-time')
  @ApiOperation({ 
    summary: 'Update preferred time',
    description: 'Update user preferred time for task scheduling (HH:mm format)',
  })
  @ApiResponse({ status: 200, description: 'Preferred time updated successfully' })
  async updatePreferredTime(
    @UserPayload() user: UserPayload,
    @Body('preferredTime') preferredTime: string,
  ) {
    return await this.userService.updatePreferredTime(user.userId, preferredTime);
  }

  /**
   * GET /users/statistics
   * Get current user statistics
   */
  @Get('statistics')
  @ApiOperation({ 
    summary: 'Get my statistics',
    description: 'Get current user task statistics',
  })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics(@UserPayload() user: UserPayload) {
    return await this.userService.getUserStatistics(user.userId);
  }

  /**
   * GET /users/me
   * Alias for getProfile
   */
  @Get('me')
  @ApiOperation({ 
    summary: 'Get current user',
    description: 'Get current authenticated user information',
  })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  async getCurrentUser(@UserPayload() user: UserPayload) {
    return await this.userService.findByIdWithCache(user.userId);
  }
}
