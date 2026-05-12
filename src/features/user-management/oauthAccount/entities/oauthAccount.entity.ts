import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OAuthProvider } from '../dto/oauthAccount.dto';

/**
 * OAuth Account Schema
 * Stores OAuth provider account information for users
 */
@Schema({ timestamps: true })
export class OAuthAccount {
  @Prop({
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(OAuthProvider),
    required: [true, 'Provider is required'],
    index: true,
  })
  provider: OAuthProvider;

  @Prop({
    type: String,
    required: [true, 'Provider user ID is required'],
    index: true,
  })
  providerUserId: string;

  @Prop({ type: String, required: true, select: false })
  accessToken: string;

  @Prop({ type: String, select: false })
  refreshToken?: string;

  @Prop({ type: String })
  email?: string;

  @Prop({ type: Date })
  tokenExpiry?: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const OAuthAccountSchema = SchemaFactory.createForClass(OAuthAccount);

export type OAuthAccountDocument = OAuthAccount & Document;

// Compound index for unique provider account
OAuthAccountSchema.index({ provider: 1, providerUserId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
