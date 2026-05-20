import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import {
  CastError,
  ValidationError as MongooseValidationError,
  Error as MongooseError,
} from 'mongoose';

/**
 * Mongoose Exception Filter
 * 
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 * 
 * Catches Mongoose-specific exceptions and returns user-friendly errors:
 * - CastError (invalid ObjectId)
 * - ValidationError (schema validation failed)
 * - DuplicateKeyError (unique constraint violation)
 * - NotFoundError (document not found)
 * - MongoServerError (database errors)
 * - MongoNetworkError (network issues)
 * 
 * Features:
 * ✅ User-friendly error messages
 * ✅ Proper HTTP status codes
 * ✅ Detailed logging
 * ✅ Development stack traces
 */
@Catch(MongooseError)
export class MongooseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MongooseExceptionFilter.name);

  catch(exception: MongooseError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error occurred';
    let error = 'Database Error';

    // Handle CastError (invalid ObjectId)
    if (exception instanceof CastError) {
      status = HttpStatus.BAD_REQUEST;
      message = `Invalid ${exception.path}: ${exception.value}`;
      error = 'Cast Error';
    }

    // Handle ValidationError
    if (exception instanceof MongooseValidationError) {
      status = HttpStatus.BAD_REQUEST;
      const errors = Object.values(exception.errors).map((err: any) => err.message);
      message = errors.join(', ');
      error = 'Validation Error';
    }

    // Handle DuplicateKeyError (code 11000)
    if ((exception as any).code === 11000) {
      status = HttpStatus.CONFLICT;
      const field = Object.keys((exception as any).keyValue)[0];
      message = `${field} already exists`;
      error = 'Duplicate Key Error';
    }

    // Handle MongoServerError (connection, authentication, etc.)
    if (exception.name === 'MongoServerError') {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Database service unavailable';
      error = 'Database Unavailable';
    }

    // Handle MongoNetworkError (network connectivity)
    if (exception.name === 'MongoNetworkError') {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Cannot connect to database';
      error = 'Network Error';
    }

    // Handle MongoTimeoutError
    if (exception.name === 'MongoTimeoutError') {
      status = HttpStatus.GATEWAY_TIMEOUT;
      message = 'Database operation timed out';
      error = 'Timeout Error';
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
