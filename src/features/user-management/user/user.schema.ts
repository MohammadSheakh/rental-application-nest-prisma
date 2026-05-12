import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { IBaseEntity } from '../../../common/base/base.entity';

/**
 * User Role Enum
 */
export enum UserRole {
  ADMIN = 'admin',
  BUSINESS = 'business',
  CHILD = 'child',
}

/**
 * Auth Provider Enum
 */
export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
  APPLE = 'apple',
}

/**
 * User Schema
 * 
 * 📚 EXPRESS → NESTJS TRANSITION
 * 
 * Express Pattern:
 * - const userSchema = new Schema({...})
 * - Manual index definitions
 * - Manual virtual populate
 * 
 * NestJS Pattern:
 * - @Schema() decorator
 * - @Prop() for each field
 * - Automatic TypeScript types
 * 
 * Key Benefits:
 * ✅ Type-safe (TypeScript)
 * ✅ Cleaner syntax (decorators)
 * ✅ Auto-generated interfaces
 * ✅ Better IDE support
 */
@Schema({ 
  timestamps: true, 
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class User extends IBaseEntity {
  /**
   * User's full name
   */
  @Prop({ required: true, trim: true })
  name: string;

  /**
   * User's email (unique, lowercase)
   */
  @Prop({ 
    required: true, 
    unique: true, 
    lowercase: true,
    trim: true 
  })
  email: string;

  /**
   * User's password (hashed, not selected by default)
   */
  @Prop({ 
    required: function() {
      return this.authProvider === AuthProvider.LOCAL;
    },
    select: false,
    minlength: 8 
  })
  password?: string;

  /**
   * User's role
   */
  @Prop({ 
    required: true, 
    enum: UserRole 
  })
  role: UserRole;

  /**
   * User's profile image
   */
  @Prop({
    type: {
      imageUrl: String,
    },
    default: { imageUrl: '/uploads/users/user.png' }
  })
  profileImage?: { imageUrl: string };

  /**
   * User's phone number
   */
  @Prop({ trim: true })
  phoneNumber?: string;

  /**
   * Email verification status
   */
  @Prop({ default: false })
  isEmailVerified: boolean;

  /**
   * Auth provider (local, google, apple)
   */
  @Prop({ 
    enum: AuthProvider, 
    default: AuthProvider.LOCAL 
  })
  authProvider: AuthProvider;

  /**
   * Reference to user profile
   */
  @Prop({ type: Types.ObjectId, ref: 'UserProfile' })
  profileId?: Types.ObjectId;

  /**
   * User's preferred time for task scheduling
   */
  @Prop({ 
    default: '07:00',
    match: /^([01]\d|2[0-3]):([0-5]\d)$/
  })
  preferredTime: string;

  /**
   * Account creator ID (for child accounts)
   */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  accountCreatorId?: Types.ObjectId;

  /**
   * Password reset flag
   */
  @Prop({ default: false })
  isResetPassword: boolean;

  /**
   * Failed login attempts (for brute force protection)
   */
  @Prop({ default: 0 })
  failedLoginAttempts: number;

  /**
   * Account lock until date
   */
  @Prop({ type: Date })
  lockUntil?: Date;

  /**
   * Soft delete flag
   */
  @Prop({ default: false })
  isDeleted: boolean;

  /**
   * Deletion timestamp
   */
  @Prop({ type: Date, default: null })
  deletedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// ─── Indexes for Performance ───────────────────────────────────────────────
/**
 * Compound indexes for common query patterns
 */
UserSchema.index({ email: 1, isDeleted: 1 });
UserSchema.index({ role: 1, isDeleted: 1 });
UserSchema.index({ role: 1, isEmailVerified: 1, isDeleted: 1 });
UserSchema.index({ accountCreatorId: 1, isDeleted: 1 });
UserSchema.index({ createdAt: -1, isDeleted: 1 });

// ─── Virtuals ───────────────────────────────────────────────────────
/**
 * Virtual: Get full user data with profile
 */
UserSchema.virtual('fullProfile', {
  ref: 'UserProfile',
  localField: 'profileId',
  foreignField: 'userId',
  justOne: true,
});

// ─── Pre-save Hook ───────────────────────────────────────────────────────
/**
 * Hash password before saving (only for local auth)
 */
UserSchema.pre('save', async function(next) {
  const user = this as any;
  
  // Only hash if password is modified and auth provider is local
  if (user.isModified('password') && user.authProvider === AuthProvider.LOCAL) {
    const bcrypt = await import('bcrypt');
    user.password = await bcrypt.hash(user.password, 12);
  }
  
  next();
});

// ─── Transform ───────────────────────────────────────────────────────
/**
 * Transform schema output for API responses
 */
UserSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    return ret;
  },
});

export type UserDocument = User & Document;
