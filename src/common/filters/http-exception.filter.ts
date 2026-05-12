import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * HTTP Exception Filter
 * 
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 * 
 * Catches all HTTP exceptions and returns standardized error response:
 * {
 *   success: false,
 *   statusCode: 400,
 *   message: 'Error message',
 *   error: 'Bad Request',
 *   timestamp: '2026-03-17T10:00:00.000Z',
 *   path: '/api/v1/users'
 * }
 * 
 * Features:
 * ✅ Consistent error response format
 * ✅ Detailed logging
 * ✅ Stack trace in development
 * ✅ User context logging
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    
    // Extract error message
    let message: string;
    let error: string;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      error = HttpStatus[status];
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObj = exceptionResponse as any;
      message = responseObj.message || responseObj.error || 'An error occurred';
      error = responseObj.error || HttpStatus[status];
      
      // Handle array of messages (e.g., validation errors)
      if (Array.isArray(message)) {
        message = message.join(', ');
      }
    } else {
      message = 'An unexpected error occurred';
      error = HttpStatus[status];
    }

    // Get user ID if authenticated
    const user = request as any;
    const userId = user.user?.userId || 'anonymous';

    // Log error with context
    this.logger.error(
      `${request.method} ${request.url} ${status} - ${message} - User: ${userId}`,
      exception.stack,
    );

    // Build response body
    const responseBody: any = {
      success: false,
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Include stack trace in development mode
    if (process.env.NODE_ENV === 'development') {
      responseBody.stack = exception.stack;
    }

    response.status(status).json(responseBody);
  }
}
