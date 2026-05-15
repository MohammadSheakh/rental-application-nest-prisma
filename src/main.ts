import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Import global filters, interceptors, guards
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

// Import security packages
import helmet from 'helmet';
import compression from 'compression';
import { NestFactory } from '@nestjs/core';

/**
 * Main Application Bootstrap
 *
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 *
 * Features:
 * ✅ Global pipes (validation)
 * ✅ Global filters (exception handling)
 * ✅ Global interceptors (transform, logging)
 * ✅ Security (Helmet, CORS)
 * ✅ Compression
 * ✅ Swagger documentation
 * ✅ Graceful shutdown
 * ✅ Socket.IO integration ⭐
 * ✅ BullMQ workers ⭐
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Create NestJS application
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 6733);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const clientUrl = configService.get<string>('CLIENT_URL', 'http://localhost:3000');

  // ────────────────────────────────────────────────────────────────────────
  // Security
  // ────────────────────────────────────────────────────────────────────────

  // Helmet - Security headers
  app.use(helmet());

  // CORS - Cross-Origin Resource Sharing
  app.enableCors({
    origin: [clientUrl, 'http://localhost:3000', 'http://localhost:8080'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  });

  // ────────────────────────────────────────────────────────────────────────
  // Compression
  // ────────────────────────────────────────────────────────────────────────

  // Gzip compression
  app.use(compression());

  // ────────────────────────────────────────────────────────────────────────
  // Global Pipes
  // ────────────────────────────────────────────────────────────────────────

  // Validation pipe - validates all incoming requests
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error if extra properties
      transform: true, // Transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
      validationError: {
        target: true, // Show target object
        value: true, // Show invalid value
      },
    }),
  );

  // ────────────────────────────────────────────────────────────────────────
  // Global Filters
  // ────────────────────────────────────────────────────────────────────────

  // HTTP exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // ────────────────────────────────────────────────────────────────────────
  // Global Interceptors
  // ────────────────────────────────────────────────────────────────────────

  // Transform response interceptor
  app.useGlobalInterceptors(new TransformResponseInterceptor());

  // Logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ────────────────────────────────────────────────────────────────────────
  // API Prefix
  // ────────────────────────────────────────────────────────────────────────

  app.setGlobalPrefix(apiPrefix);

  // ────────────────────────────────────────────────────────────────────────
  // Swagger Documentation
  // ────────────────────────────────────────────────────────────────────────

  if (nodeEnv === 'development') {
    const config = new DocumentBuilder()
      .setTitle('Task Management API')
      .setDescription('Task Management Backend API - NestJS + Mongoose')
      .setVersion('1.0.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token',
      })
      .addTag('Authentication', 'User authentication endpoints')
      .addTag('Users', 'User management endpoints')
      .addTag('Tasks', 'Task management endpoints')
      .addTag('Children Business User', 'Parent-child relationship management')
      .addTag('Notifications', 'Notification management endpoints')
      .addTag('Attachments', 'File upload endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Socket.IO Setup ⭐
  // ────────────────────────────────────────────────────────────────────────

  // Socket.IO is automatically initialized via SocketModule
  // The SocketGateway is a global module that handles WebSocket connections
  logger.log(`🔌 Socket.IO Gateway: Enabled (namespace: /socket.io)`);

  // ────────────────────────────────────────────────────────────────────────
  // BullMQ Workers ⭐
  // ────────────────────────────────────────────────────────────────────────

  // BullMQ workers are automatically initialized via BullMQModule
  // Workers listen to queues and process jobs asynchronously
  logger.log(`⚡ BullMQ Workers: Enabled (5 queues)`);
  logger.log(`   - notificationQueue-e-learning`);
  logger.log(`   - updateConversationsLastMessageQueue-suplify`);
  logger.log(`   - task-reminders-queue`);
  logger.log(`   - notify-participants-queue-suplify`);
  logger.log(`   - preferredTimeQueue`);

  // ────────────────────────────────────────────────────────────────────────
  // Graceful Shutdown
  // ────────────────────────────────────────────────────────────────────────

  // Enable shutdown hooks
  app.enableShutdownHooks();

  // Handle process termination
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM signal received: closing HTTP server');
    await app.close();
    logger.log('HTTP server closed');
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT signal received: closing HTTP server');
    await app.close();
    logger.log('HTTP server closed');
    process.exit(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Start Application
  // ────────────────────────────────────────────────────────────────────────

  await app.listen(port);

  logger.log(`🚀 Application started on port ${port}`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
  logger.log(`📡 API Prefix: ${apiPrefix}`);
  logger.log(`🔗 API URL: http://localhost:${port}/${apiPrefix}`);
  logger.log(`🔌 Socket.IO: http://localhost:${port}/socket.io`);
  logger.log(`⚡ BullMQ: 5 workers active`);
}

// Bootstrap the application
bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application:', error);
  process.exit(1);
});
