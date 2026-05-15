import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { GenericController } from '../../../common/generic/generic.controller';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { User as CurrentUser } from '../../../common/decorators/user.decorator';
import type { UserPayload } from '../../../common/types/user-payload.type';
import { TransformResponseInterceptor } from '../../../common/interceptors/transform-response.interceptor';
import { SlidingWindowRateLimitGuard } from '../../../common/guards/sliding-window-rate-limit.guard';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { USER_RATE_LIMITS } from './user.constants';

/**
 * User Controller
 * 
 * 📚 SENIOR LEVEL IMPLEMENTATION
 * 
 * Features:
 * ✅ Automatic CRUD via GenericController
 * ✅ Sliding Window Rate Limiting per endpoint
 * ✅ Role-based access control (via AuthGuard)
 * ✅ Pattern-based Redis caching
 */
@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard, SlidingWindowRateLimitGuard)
@UseInterceptors(TransformResponseInterceptor)
@ApiBearerAuth()
export class UserController extends GenericController {
  constructor(private userService: UserService) {
    super(userService, 'User');
  }

  /**
   * GET /users/profile
   * Get current user profile
   */
  @Get('profile')
  @RateLimit(USER_RATE_LIMITS.PROFILE_ACCESS)
  @ApiOperation({ 
    summary: 'Get my profile',
    description: 'Get current authenticated user profile with statistics',
  })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getProfile(@CurrentUser() user: UserPayload) {
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
  @RateLimit(USER_RATE_LIMITS.PROFILE_UPDATE)
  @ApiOperation({ 
    summary: 'Update my profile',
    description: 'Update current authenticated user profile information',
  })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @CurrentUser() user: UserPayload,
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
  @RateLimit(USER_RATE_LIMITS.PROFILE_UPDATE)
  @ApiOperation({ 
    summary: 'Update preferred time',
    description: 'Update user preferred time for task scheduling (HH:mm format)',
  })
  @ApiResponse({ status: 200, description: 'Preferred time updated successfully' })
  async updatePreferredTime(
    @CurrentUser() user: UserPayload,
    @Body('preferredTime') preferredTime: string,
  ) {
    return await this.userService.updatePreferredTime(user.userId, preferredTime);
  }

  /**
   * GET /users/statistics
   * Get current user statistics
   */
  @Get('statistics')
  @RateLimit(USER_RATE_LIMITS.PROFILE_ACCESS)
  @ApiOperation({ 
    summary: 'Get my statistics',
    description: 'Get current user task statistics',
  })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics(@CurrentUser() user: UserPayload) {
    return await this.userService.getUserStatistics(user.userId);
  }

  /**
   * GET /users/me
   * Alias for getProfile
   */
  @Get('me')
  @RateLimit(USER_RATE_LIMITS.PROFILE_ACCESS)
  @ApiOperation({ 
    summary: 'Get current user',
    description: 'Get current authenticated user information',
  })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  async getCurrentUser(@CurrentUser() user: UserPayload) {
    return await this.userService.findByIdWithCache(user.userId);
  }
}
