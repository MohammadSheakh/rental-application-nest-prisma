import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * User Payload Interface
 * Extracted from JWT token
 */
export interface UserPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Authentication Guard
 * 
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 * 
 * Features:
 * ✅ JWT token validation
 * ✅ Public route support (via @Public() decorator)
 * ✅ User payload extraction
 * ✅ Request context attachment
 * 
 * Usage:
 * @UseGuards(AuthGuard)
 * async getProfile(@User() user: UserPayload) { ... }
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public (no auth required)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Extract request from context
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    // Token not found
    if (!token) {
      throw new UnauthorizedException('Authentication token is required');
    }

    try {
      // Verify and decode token
      const payload: UserPayload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });

      // Attach user payload to request object
      // Can be accessed via @User() decorator in controllers
      request['user'] = payload;
    } catch (error) {
      // Token verification failed
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token');
      }
      throw new UnauthorizedException('Authentication failed');
    }

    return true;
  }

  /**
   * Extract JWT token from Authorization header
   * Expected format: "Bearer <token>" (case-insensitive)
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    // Handle both "Bearer" and "bearer" (case-insensitive)
    return type?.toLowerCase() === 'bearer' ? token : undefined;
  }
}
