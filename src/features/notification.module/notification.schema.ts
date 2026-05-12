import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { IBaseEntity } from '../../../common/base/base.entity';

/**
 * Notification Type Enum
 */
export enum NotificationType {
  TASK = 'task',
  GROUP = 'group',
  SYSTEM = 'system',
  REMINDER = 'reminder',
  MENTION = 'mention',
  ASSIGNMENT = 'assignment',
  DEADLINE = 'deadline',
  CUSTOM = 'custom',
}

/**
 * Notification Priority Enum
 */
export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * Notification Status Enum
 */
export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

/**
 * Notification Schema
 * 
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 * 
 * Supports:
 * - In-app notifications
 * - Push notifications
 * - Email notifications
 * - Real-time Socket.IO delivery
 * - Activity feed tracking
 */
@Schema({ 
  timestamps: true, 
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class Notification extends IBaseEntity {
  /**
   * Sender user ID
   */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  senderId?: Types.ObjectId;

  /**
   * Receiver user ID
   */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  receiverId?: Types.ObjectId;

  /**
   * Receiver role (for broadcast to roles)
   */
  @Prop({ trim: true })
  receiverRole?: string;

  /**
   * Notification type
   */
  @Prop({ 
    enum: NotificationType, 
    required: true 
  })
  type: NotificationType;

  /**
   * Notification priority
   */
  @Prop({ 
    enum: NotificationPriority, 
    default: NotificationPriority.NORMAL 
  })
  priority: NotificationPriority;

  /**
   * Notification status
   */
  @Prop({ 
    enum: NotificationStatus, 
    default: NotificationStatus.PENDING 
  })
  status: NotificationStatus;

  /**
   * Notification title
   */
  @Prop({ required: true, trim: true })
  title: string;

  /**
   * Notification message
   */
  @Prop({ trim: true })
  message?: string;

  /**
   * Entity type this notification is about (task, group, etc.)
   */
  @Prop({ trim: true })
  entityType?: string;

  /**
   * Entity ID this notification is about
   */
  @Prop({ type: Types.ObjectId })
  entityId?: Types.ObjectId;

  /**
   * Link for notification action
   */
  @Prop({ trim: true })
  linkFor?: string;

  /**
   * Link ID for navigation
   */
  @Prop({ type: Types.ObjectId })
  linkId?: Types.ObjectId;

  /**
   * Data payload (for custom data)
   */
  @Prop({ type: Object })
  data?: any;

  /**
   * Is notification read
   */
  @Prop({ default: false })
  isRead: boolean;

  /**
   * Read timestamp
   */
  @Prop({ type: Date })
  readAt?: Date;

  /**
   * Delivered timestamp
   */
  @Prop({ type: Date })
  deliveredAt?: Date;

  /**
   * Soft delete flag
   */
  @Prop({ default: false })
  isDeleted: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// ─── Indexes for Performance ───────────────────────────────────────────────
/**
 * Compound indexes for common query patterns
 */
NotificationSchema.index({ receiverId: 1, isRead: 1, isDeleted: 1, createdAt: -1 });
NotificationSchema.index({ receiverId: 1, status: 1, isDeleted: 1 });
NotificationSchema.index({ senderId: 1, isDeleted: 1 });
NotificationSchema.index({ type: 1, isDeleted: 1 });
NotificationSchema.index({ entityType: 1, entityId: 1, isDeleted: 1 });
NotificationSchema.index({ receiverRole: 1, isDeleted: 1 });

// TTL index for auto-expiry (30 days for read notifications)
NotificationSchema.index({ readAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// ─── Virtuals ───────────────────────────────────────────────────────
/**
 * Virtual: Get sender details
 */
NotificationSchema.virtual('sender', {
  ref: 'User',
  localField: 'senderId',
  foreignField: '_id',
  justOne: true,
});

/**
 * Virtual: Get receiver details
 */
NotificationSchema.virtual('receiver', {
  ref: 'User',
  localField: 'receiverId',
  foreignField: '_id',
  justOne: true,
});

// ─── Transform ───────────────────────────────────────────────────────
/**
 * Transform schema output for API responses
 */
NotificationSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type NotificationDocument = Notification & Document;
