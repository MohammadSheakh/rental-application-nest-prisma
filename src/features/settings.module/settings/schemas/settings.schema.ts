import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SettingsType } from '../constants/settings.constants';

/**
 * Settings Schema
 * Stores static content like About Us, Privacy Policy, etc.
 *
 * @version 1.0.0 (NestJS Migration)
 * @author Senior Engineering Team
 */
@Schema({
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Settings {
  /**
   * MongoDB document ID
   */
  _id?: Types.ObjectId;

  /**
   * Type of setting (aboutUs, privacyPolicy, etc.)
   */
  @Prop({
    type: String,
    enum: Object.values(SettingsType),
    required: [true, 'Settings type is required'],
    index: true,
    unique: true,
  })
  type: SettingsType;

  /**
   * Content/details for this setting type
   */
  @Prop({
    type: String,
    required: [false, 'Details is not required'],
    default: '',
  })
  details: string;

  /**
   * Introduction video URL or metadata (for introductionVideo type)
   */
  @Prop({ type: Schema.Types.Mixed })
  introductionVideo?: Record<string, any>;

  /**
   * Creation timestamp (auto-managed by Mongoose)
   */
  createdAt?: Date;

  /**
   * Last update timestamp (auto-managed by Mongoose)
   */
  updatedAt?: Date;
}

/**
 * Settings Schema Definition
 */
export const SettingsSchema = SchemaFactory.createForClass(Settings);

/**
 * Index for efficient queries by type
 */
SettingsSchema.index({ type: 1, isDeleted: 1 });

/**
 * toJSON transformation
 */
SettingsSchema.set('toJSON', {
  transform: function (doc, ret, options) {
    ret.settingsId = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

/**
 * Static method: Find by type
 */
SettingsSchema.statics.findByType = async function (
  type: SettingsType,
): Promise<SettingsDocument | null> {
  return this.findOne({ type });
};

/**
 * Static method: Get all settings
 */
SettingsSchema.statics.findAll = async function (): Promise<SettingsDocument[]> {
  return this.find({}).sort({ type: 1 });
};

/**
 * Settings Document Type
 */
export type SettingsDocument = Settings & Document;

/**
 * Settings Model Type
 */
export type SettingsModel = typeof Settings;
