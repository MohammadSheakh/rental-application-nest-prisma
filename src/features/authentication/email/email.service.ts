import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from 'src/core/queue/bullmq.constants';

/**
 * Email Service
 *
 * 📧 EMAIL SENDING SERVICE
 *
 * Handles all email sending operations:
 * - OTP verification emails
 * - Password reset emails
 * - Welcome emails
 * - Notification emails
 *
 * Production Ready:
 * - Integrate with SendGrid, AWS SES, or Nodemailer
 * - Queue emails via BullMQ for async processing
 * - Track email delivery and open rates
 *
 * Current Implementation:
 * - Logs emails to console (development)
 * - Ready for production integration
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private emailQueue: Queue,
  ) {}

  /**
   * Send OTP Email (Queued)
   *
   * @param email - Recipient email address
   * @param otp - OTP code
   * @param type - OTP type (verify or reset)
   */
  async sendOtpEmail(email: string, otp: string, type: 'verify' | 'reset'): Promise<void> {
    await this.emailQueue.add('send-otp-email', { email, otp, type });
    this.logger.log(`📧 OTP email queued for ${email}`);
  }

  /**
   * Send OTP Email Now
   */
  async sendOtpEmailNow(email: string, otp: string, type: 'verify' | 'reset'): Promise<void> {
    const subject = type === 'verify'
      ? 'Verify Your Email - Task Management'
      : 'Password Reset - Task Management';

    // Development: Log to console
    this.logger.log(`📧 [PROCESSOR] Sending OTP email to ${email}:`);
    this.logger.log(`   Subject: ${subject}`);
    this.logger.log(`   OTP: ${otp}`);
    this.logger.log(`   Type: ${type}`);

    // Production: Integrate with email provider
    // await this.sendEmail({
    //   to: email,
    //   subject,
    //   html: this.getOtpEmailTemplate(otp, type),
    // });
  }

  /**
   * Send Welcome Email (Queued)
   *
   * @param email - Recipient email address
   * @param name - User name
   */
  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    await this.emailQueue.add('send-welcome-email', { email, name });
    this.logger.log(`📧 Welcome email queued for ${email}`);
  }

  /**
   * Send Welcome Email Now
   */
  async sendWelcomeEmailNow(email: string, name: string): Promise<void> {
    this.logger.log(`📧 [PROCESSOR] Sending welcome email to ${email}:`);
    this.logger.log(`   Name: ${name}`);
    this.logger.log(`   Subject: Welcome to Task Management!`);

    // Production: Send actual email
    // await this.sendEmail({
    //   to: email,
    //   subject: 'Welcome to Task Management!',
    //   html: this.getWelcomeEmailTemplate(name),
    // });
  }

  /**
   * Send Password Reset Confirmation (Queued)
   *
   * @param email - Recipient email address
   */
  async sendPasswordResetConfirmation(email: string): Promise<void> {
    await this.emailQueue.add('send-password-reset-confirmation', { email });
    this.logger.log(`📧 Password reset confirmation queued for ${email}`);
  }

  /**
   * Send Password Reset Confirmation Now
   */
  async sendPasswordResetConfirmationNow(email: string): Promise<void> {
    this.logger.log(`📧 [PROCESSOR] Sending password reset confirmation to ${email}`);

    // Production: Send actual email
    // await this.sendEmail({
    //   to: email,
    //   subject: 'Password Reset Successful',
    //   html: this.getPasswordResetConfirmationTemplate(),
    // });
  }

  /**
   * Send Task Notification Email (Queued)
   *
   * @param email - Recipient email address
   * @param taskTitle - Task title
   * @param type - Notification type (assigned, completed, etc.)
   */
  async sendTaskNotificationEmail(
    email: string,
    taskTitle: string,
    type: 'assigned' | 'completed' | 'due_soon' | 'overdue',
  ): Promise<void> {
    await this.emailQueue.add('send-task-notification', { email, taskTitle, type });
    this.logger.log(`📧 Task notification queued for ${email}`);
  }

  /**
   * Send Task Notification Email Now
   */
  async sendTaskNotificationEmailNow(
    email: string,
    taskTitle: string,
    type: 'assigned' | 'completed' | 'due_soon' | 'overdue',
  ): Promise<void> {
    const subjects = {
      assigned: 'New Task Assigned',
      completed: 'Task Completed',
      due_soon: 'Task Due Soon',
      overdue: 'Task Overdue',
    };

    this.logger.log(`📧 [PROCESSOR] Sending task notification to ${email}:`);
    this.logger.log(`   Task: ${taskTitle}`);
    this.logger.log(`   Type: ${type}`);
    this.logger.log(`   Subject: ${subjects[type]}`);

    // Production: Send actual email
    // await this.sendEmail({
    //   to: email,
    //   subject: subjects[type],
    //   html: this.getTaskNotificationTemplate(taskTitle, type),
    // });
  }

  /**
   * Generic Send Email Method
   *
   * Production implementation with SendGrid/AWS SES
   *
   * @param options - Email options
   */
  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<void> {
    // Production: Implement with your email provider
    // Example with SendGrid:
    // const msg = {
    //   to: options.to,
    //   from: process.env.EMAIL_FROM,
    //   subject: options.subject,
    //   html: options.html,
    //   text: options.text,
    // };
    // await sgMail.send(msg);

    // For now, log to console
    this.logger.debug(`Email actually sending: ${options.to} - ${options.subject}`);
  }

  /**
   * OTP Email Template
   */
  private getOtpEmailTemplate(otp: string, type: 'verify' | 'reset'): string {
    const title = type === 'verify'
      ? 'Verify Your Email'
      : 'Reset Your Password';

    const description = type === 'verify'
      ? 'Thank you for registering! Please use the following OTP to verify your email address.'
      : 'You requested a password reset. Please use the following OTP to reset your password.';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; }
            .otp { font-size: 32px; font-weight: bold; color: #4F46E5; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${title}</h1>
            </div>
            <div class="content">
              <p>${description}</p>
              <div class="otp">${otp}</div>
              <p>This OTP is valid for 10 minutes. Do not share it with anyone.</p>
              <p>If you didn't request this, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 Task Management. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Welcome Email Template
   */
  private getWelcomeEmailTemplate(name: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 30px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; }
            .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Task Management!</h1>
            </div>
            <div class="content">
              <p>Hi ${name},</p>
              <p>We're excited to have you on board! Start managing your tasks efficiently and boost your productivity.</p>
              <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard" class="button">Go to Dashboard</a>
              <p>Here's what you can do:</p>
              <ul>
                <li>✅ Create and organize tasks</li>
                <li>✅ Set priorities and due dates</li>
                <li>✅ Track your progress</li>
                <li>✅ Collaborate with your team</li>
              </ul>
            </div>
            <div class="footer">
              <p>&copy; 2026 Task Management. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Password Reset Confirmation Template
   */
  private getPasswordResetConfirmationTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 30px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Successful</h1>
            </div>
            <div class="content">
              <p>Your password has been successfully reset.</p>
              <p>If you didn't request this change, please contact our support team immediately.</p>
              <p>For security reasons, please use a strong password and don't share it with anyone.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 Task Management. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Task Notification Template
   */
  private getTaskNotificationTemplate(taskTitle: string, type: string): string {
    const colors = {
      assigned: '#4F46E5',
      completed: '#10B981',
      due_soon: '#F59E0B',
      overdue: '#EF4444',
    };

    const messages = {
      assigned: 'A new task has been assigned to you',
      completed: 'A task has been marked as completed',
      due_soon: 'A task is due soon',
      overdue: 'A task is overdue',
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${colors[type]}; color: white; padding: 30px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; }
            .task-title { font-size: 20px; font-weight: bold; color: #333; margin: 20px 0; }
            .button { display: inline-block; background: ${colors[type]}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${messages[type]}</h1>
            </div>
            <div class="content">
              <div class="task-title">${taskTitle}</div>
              <p>Log in to your dashboard to view all your tasks and updates.</p>
              <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard" class="button">View Dashboard</a>
            </div>
            <div class="footer">
              <p>&copy; 2026 Task Management. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
