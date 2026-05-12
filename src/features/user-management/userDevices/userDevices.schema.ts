import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { IBaseEntity } from '../../../common/base/base.entity';

/**
 * Device Type Enum
 */
export enum DeviceType {
  WEB = 'web',
  IOS = 'ios',
  ANDROID = 'android',
  DESKTOP = 'desktop',
}

/**
 * User Devices Schema
 * 
 * Tracks user devices for push notifications
 */
@Schema({ 
  timestamps: true, 
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class UserDevices extends IBaseEntity {
  /**
   * Reference to user
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  /**
   * FCM token for push notifications
   */
  @Prop({ required: true, trim: true })
  fcmToken: string;

  /**
   * Device type (web/ios/android/desktop)
   */
  @Prop({ 
    enum: DeviceType, 
    default: DeviceType.WEB 
  })
  deviceType: DeviceType;

  /**
   * Device name/model
   */
  @Prop({ trim: true })
  deviceName?: string;

  /**
   * Device OS version
   */
  @Prop({ trim: true })
  deviceOsVersion?: string;

  /**
   * App version (for mobile devices)
   */
  @Prop({ trim: true })
  appVersion?: string;

  /**
   * Last active timestamp
   */
  @Prop({ type: Date, default: Date.now })
  lastActive: Date;

  /**
   * Push notification enabled
   */
  @Prop({ default: true })
  pushEnabled: boolean;

  /**
   * Soft delete flag
   */
  @Prop({ default: false })
  isDeleted: boolean;
}

export const UserDevicesSchema = SchemaFactory.createForClass(UserDevices);

// ─── Indexes for Performance ───────────────────────────────────────────────
/**
 * Compound indexes for common query patterns
 */
UserDevicesSchema.index({ userId: 1, isDeleted: 1 });
UserDevicesSchema.index({ fcmToken: 1, isDeleted: 1 });
UserDevicesSchema.index({ deviceType: 1, isDeleted: 1 });
UserDevicesSchema.index({ lastActive: -1, isDeleted: 1 });

// TTL index for old inactive devices (optional - auto cleanup after 1 year)
// UserDevicesSchema.index({ lastActive: 1 }, { expireAfterSeconds: 31536000 });

// ─── Transform ───────────────────────────────────────────────────────
/**
 * Transform schema output for API responses
 */
UserDevicesSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type UserDevicesDocument = UserDevices & Document;
