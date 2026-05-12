import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { IBaseEntity } from '../../../common/base/base.entity';

/**
 * Approval Status Enum
 */
export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * Admin Status Enum
 */
export enum AdminStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * User Profile Schema
 * 
 * Stores extended user information separate from User entity
 */
@Schema({ 
  timestamps: true, 
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class UserProfile extends IBaseEntity {
  /**
   * Reference to user
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  /**
   * User's location
   */
  @Prop({ trim: true })
  location?: string;

  /**
   * Date of birth
   */
  @Prop({ type: Date })
  dob?: Date;

  /**
   * Gender
   */
  @Prop({ trim: true })
  gender?: string;

  /**
   * Accept Terms and Conditions
   */
  @Prop({ default: false })
  acceptTOC: boolean;

  /**
   * Support mode preference (calm/encouraging/logical)
   */
  @Prop({ default: 'calm' })
  supportMode: string;

  /**
   * Notification style preference (gentle/firm/neutral)
   */
  @Prop({ default: 'gentle' })
  notificationStyle: string;

  /**
   * Approval status (for service providers)
   */
  @Prop({ 
    enum: ApprovalStatus, 
    default: ApprovalStatus.PENDING 
  })
  providerApprovalStatus: ApprovalStatus;

  /**
   * Admin status
   */
  @Prop({ 
    enum: AdminStatus, 
    default: AdminStatus.ACTIVE 
  })
  adminStatus: AdminStatus;

  /**
   * Front side certificate image (for service providers)
   */
  @Prop({ type: Types.ObjectId, ref: 'Attachment' })
  frontSideCertificateImage?: Types.ObjectId;

  /**
   * Back side certificate image (for service providers)
   */
  @Prop({ type: Types.ObjectId, ref: 'Attachment' })
  backSideCertificateImage?: Types.ObjectId;

  /**
   * Face image from front cam (for verification)
   */
  @Prop({ type: Types.ObjectId, ref: 'Attachment' })
  faceImageFromFrontCam?: Types.ObjectId;

  /**
   * Soft delete flag
   */
  @Prop({ default: false })
  isDeleted: boolean;
}

export const UserProfileSchema = SchemaFactory.createForClass(UserProfile);

// ─── Indexes for Performance ───────────────────────────────────────────────
/**
 * Compound indexes for common query patterns
 */
UserProfileSchema.index({ userId: 1, isDeleted: 1 });
UserProfileSchema.index({ providerApprovalStatus: 1, isDeleted: 1 });
UserProfileSchema.index({ adminStatus: 1, isDeleted: 1 });

// ─── Virtuals ───────────────────────────────────────────────────────
/**
 * Virtual: Get user details
 */
UserProfileSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

// ─── Transform ───────────────────────────────────────────────────────
/**
 * Transform schema output for API responses
 */
UserProfileSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type UserProfileDocument = UserProfile & Document;
