import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserPayload } from '../types/user-payload.type';
/**
 * User Decorator
 * 
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 * 
 * Extracts user payload from request object
 * Type-safe access to authenticated user information
 * 
 * Usage:
 * @Get('profile')
 * async getProfile(@User() user: UserPayload) {
 *   // user.userId, user.email, user.role
 * }
 * 
 * With fields selection:
 * @Get('profile')
 * async getProfile(@User('email') email: string) {
 *   // Only extracts email field
 * }
 */

// Single decorator, two aliases so both @User() and @UserPayload() work
const userParamDecorator = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: UserPayload = request.user;

    if (!user) return null;
    if (data) return user[data];
    return user;
  },
);

export const User = userParamDecorator;
export const UserPayload = userParamDecorator; // alias — same thing

/* -----------------------

export const User = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: UserPayload = request.user;

    // If no user found, AuthGuard should have thrown an error
    if (!user) {
      return null;
    }

    // Return specific field if requested
    if (data) {
      return user[data];
    }

    // Return entire user payload
    return user;
  },
);
-----------------------*/
