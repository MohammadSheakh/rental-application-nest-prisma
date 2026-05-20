import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../bullmq.constants';
import { EmailService } from '../../../features/authentication/email/email.service';

/**
 * Email Processor
 *
 * 📧 BULLMQ WORKER FOR ASYNC EMAIL PROCESSING
 *
 * Updated to use WorkerHost (compatible with @nestjs/bullmq v11)
 */
@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { email } = job.data;
    this.logger.log(`Processing job ${job.id} (${job.name}) for ${email}`);

    try {
      switch (job.name) {
        case 'send-otp-email':
          return await this.emailService.sendOtpEmailNow(job.data.email, job.data.otp, job.data.type);
        case 'send-welcome-email':
          return await this.emailService.sendWelcomeEmailNow(job.data.email, job.data.name);
        case 'send-password-reset-confirmation':
          return await this.emailService.sendPasswordResetConfirmationNow(job.data.email);
        case 'send-task-notification':
          return await this.emailService.sendTaskNotificationEmailNow(job.data.email, job.data.taskTitle, job.data.type);
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
      }
    } catch (err: any) {
      this.logger.error(`❌ Job ${job.id} (${job.name}) failed: ${err.message}`);
      throw err;
    }
  }
}
