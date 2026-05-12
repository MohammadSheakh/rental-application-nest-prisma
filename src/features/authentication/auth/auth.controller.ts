import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Res,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OAuthLoginDto } from './dto/oauth-login.dto';
import { CreateOtpDto, VerifyOtpDto } from '../otp/dto/create-otp.dto';
import { TransformResponseInterceptor } from '../../../common/interceptors/transform-response.interceptor';
import { ThrottleGuard } from '@nestjs/throttler';

/**
 * Auth Controller
 * 
 * 📚 EXPRESS → NESTJS TRANSITION
 * 
 * Express Pattern:
 * - router.post('/login', authController.login)
 * - Manual response formatting: sendResponse(res, {...})
 * - Manual cookie setting: res.cookie(...)
 * - req.body.email, req.body.password
 * 
 * NestJS Pattern:
 * - @Post('login') decorator
 * - @Body() decorator for DTO validation
 * - @Res({ passthrough: true }) for cookies
 * - Automatic response transformation via interceptor
 * 
 * Key Benefits:
 * ✅ Automatic validation (DTOs)
 * ✅ Cleaner code (decorators)
 * ✅ Better testability (DI)
 * ✅ Swagger documentation (auto-generated)
 */
@ApiTags('Authentication')
@Controller('auth')
@UseInterceptors(TransformResponseInterceptor)
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /auth/login
   * Authenticate user and return tokens
   * 
   * @param loginDto - Login credentials
   * @param res - Express response (for cookies)
   * @returns User info and access token
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'User login',
    description: 'Authenticate user with email and password',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @UseGuards(ThrottleGuard)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);

    // Set refresh token in HTTP-only cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      user: result.user,
      accessToken: result.accessToken,
      // refreshToken is in cookie, not returned in body
    };
  }

  /**
   * POST /auth/register
   * Register new user
   * 
   * @param registerDto - Registration data
   * @returns User info (without password)
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'User registration',
    description: 'Register a new user account',
  })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ status: 400, description: 'Email already exists' })
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto);
  }

  /**
   * POST /auth/oauth
   * OAuth login (Google/Apple)
   * 
   * @param oauthLoginDto - OAuth login data
   * @param res - Express response (for cookies)
   * @returns User info and access token
   */
  @Post('oauth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'OAuth login (Google/Apple)',
    description: 'Authenticate user with Google or Apple OAuth',
  })
  @ApiResponse({ status: 200, description: 'OAuth login successful' })
  @ApiResponse({ status: 401, description: 'Invalid OAuth token' })
  async oauthLogin(
    @Body() oauthLoginDto: OAuthLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.oauthLogin(oauthLoginDto);

    // Set refresh token in HTTP-only cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   * 
   * @param req - Express request (for cookies)
   * @returns New access token and refresh token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Refresh access token',
    description: 'Get new access token using refresh token',
  })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const result = await this.authService.refreshToken(refreshToken);

    // Set new refresh token in cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      accessToken: result.accessToken,
    };
  }

  /**
   * POST /auth/logout
   * Logout user and blacklist refresh token
   * 
   * @param req - Express request (for cookies)
   * @returns Success message
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'User logout',
    description: 'Logout user and invalidate refresh token',
  })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    return { message: 'Logout successful' };
  }

  /**
   * POST /auth/forgot-password
   * Send password reset OTP
   * 
   * @param createOtpDto - Email and OTP type
   * @returns Success message
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Forgot password',
    description: 'Send password reset OTP to email',
  })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async forgotPassword(@Body() createOtpDto: CreateOtpDto) {
    await this.authService.forgotPassword(createOtpDto.email);
    return { message: 'Password reset OTP sent successfully' };
  }

  /**
   * POST /auth/verify-otp
   * Verify OTP for email verification or password reset
   * 
   * @param verifyOtpDto - Email, OTP, and type
   * @returns Success message
   */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Verify OTP',
    description: 'Verify OTP for email verification or password reset',
  })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid OTP' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    await this.authService.verifyOtp(
      verifyOtpDto.email,
      verifyOtpDto.otp,
      verifyOtpDto.type,
    );
    return { message: 'OTP verified successfully' };
  }

  /**
   * POST /auth/reset-password
   * Reset password with OTP verification
   * 
   * @param body - Email, OTP, and new password
   * @returns Success message
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Reset password',
    description: 'Reset password with OTP verification',
  })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid OTP' })
  async resetPassword(
    @Body() body: { email: string; otp: string; newPassword: string },
  ) {
    await this.authService.resetPassword(
      body.email,
      body.otp,
      body.newPassword,
    );
    return { message: 'Password reset successful' };
  }
}
