import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { IBaseEntity } from '../../../common/base/base.entity';

/**
 * Auth Provider Enum
 */
export enum AuthProvider {
  GOOGLE = 'google',
  APPLE = 'apple',
}

/**
 * OAuth Account Schema
 * 
 * Stores OAuth provider accounts linked to users
 * Allows multiple OAuth providers per user
 */
@Schema({ 
  timestamps: true, 
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class OAuthAccount extends IBaseEntity {
  /**
   * Reference to user
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  /**
   * OAuth provider (google/apple)
   */
  @Prop({ 
    enum: AuthProvider, 
    required: true 
  })
  authProvider: AuthProvider;

  /**
   * Provider's user ID (Google sub, Apple sub)
   */
  @Prop({ required: true, trim: true })
  providerId: string;

  /**
   * Email from OAuth provider
   */
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  /**
   * OAuth access token (encrypted in production)
   */
  @Prop({ select: false, trim: true })
  accessToken?: string;

  /**
   * OAuth refresh token (encrypted in production)
   */
  @Prop({ select: false, trim: true })
  refreshToken?: string;

  /**
   * ID token from provider
   */
  @Prop({ select: false, trim: true })
  idToken?: string;

  /**
   * Account verified status
   */
  @Prop({ default: true })
  isVerified: boolean;

  /**
   * Last used timestamp
   */
  @Prop({ type: Date })
  lastUsedAt?: Date;

  /**
   * Soft delete flag
   */
  @Prop({ default: false })
  isDeleted: boolean;
}

export const OAuthAccountSchema = SchemaFactory.createForClass(OAuthAccount);

// ─── Indexes for Performance ───────────────────────────────────────────────
/**
 * Compound indexes for common query patterns
 */
OAuthAccountSchema.index({ userId: 1, isDeleted: 1 });
OAuthAccountSchema.index({ authProvider: 1, providerId: 1, isDeleted: 1 });
OAuthAccountSchema.index({ email: 1, isDeleted: 1 });
OAuthAccountSchema.index({ providerId: 1, isDeleted: 1 });

// Unique index to prevent duplicate OAuth accounts
OAuthAccountSchema.index({ authProvider: 1, providerId: 1 }, { unique: true });

// ─── Virtuals ───────────────────────────────────────────────────────
/**
 * Virtual: Get user details
 */
OAuthAccountSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

// ─── Transform ───────────────────────────────────────────────────────
/**
 * Transform schema output for API responses
 * Exclude sensitive fields
 */
OAuthAccountSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    delete ret.accessToken;
    delete ret.refreshToken;
    delete ret.idToken;
    return ret;
  },
});

export type OAuthAccountDocument = OAuthAccount & Document;
