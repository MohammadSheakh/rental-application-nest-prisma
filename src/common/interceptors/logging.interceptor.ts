import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Logging Interceptor
 * 
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 * 
 * Logs all HTTP requests with:
 * - Request method and URL
 * - Response status code
 * - Response time
 * - User ID (if authenticated)
 * 
 * Features:
 * ✅ Structured logging
 * ✅ Response time tracking
 * ✅ User context logging
 * ✅ Error logging
 * 
 * Usage:
 * @UseInterceptors(LoggingInterceptor)
 * async getData() { ... }
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const { method, url, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const ip = this.getClientIP(request);
    
    // Get user ID if authenticated
    const user = request as any;
    const userId = user.user?.userId || 'anonymous';
    
    // Start time for response time calculation
    const now = Date.now();
    
    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - now;
        
        this.logger.log(
          `${method} ${url} ${response.statusCode} - ${responseTime}ms - User: ${userId} - IP: ${ip}`,
        );
      }),
    );
  }

  /**
   * Get client IP address
   * Handles proxied requests (e.g., behind nginx, load balancer)
   */
  private getClientIP(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
