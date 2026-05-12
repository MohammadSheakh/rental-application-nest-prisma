import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { IBaseEntity } from '@common/base/base.entity';

/**
 * Attachment Type Enum
 */
export enum AttachmentType {
  DOCUMENT = 'document',
  IMAGE = 'image',
  VIDEO = 'video',
  UNKNOWN = 'unknown',
}

/**
 * Attachment Schema
 * 
 * Stores file attachment metadata
 * Files are stored in Cloudinary/S3
 */
@Schema({ 
  timestamps: true, 
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class Attachment extends IBaseEntity {
  /**
   * File URL (Cloudinary/S3)
   */
  @Prop({ required: true })
  attachment: string;

  /**
   * File type (image/document/video/unknown)
   */
  @Prop({ 
    enum: AttachmentType, 
    required: true 
  })
  attachmentType: AttachmentType;

  /**
   * Cloudinary public ID (for deletion)
   */
  @Prop()
  publicId?: string;

  /**
   * Original file name
   */
  @Prop({ trim: true })
  originalName?: string;

  /**
   * File size in bytes
   */
  @Prop()
  size?: number;

  /**
   * MIME type
   */
  @Prop({ trim: true })
  mimeType?: string;

  /**
   * User who uploaded the file
   */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedByUserId?: Types.ObjectId;

  /**
   * Entity type this attachment is attached to (task, user, message, etc.)
   */
  @Prop({ trim: true })
  attachedToType?: string;

  /**
   * Entity ID this attachment is attached to
   */
  @Prop({ type: Types.ObjectId })
  attachedToId?: Types.ObjectId;

  /**
   * Soft delete flag
   */
  @Prop({ default: false })
  isDeleted: boolean;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);

// ─── Indexes for Performance ───────────────────────────────────────────────
/**
 * Compound indexes for common query patterns
 */
AttachmentSchema.index({ uploadedByUserId: 1, isDeleted: 1 });
AttachmentSchema.index({ attachedToType: 1, attachedToId: 1, isDeleted: 1 });
AttachmentSchema.index({ attachmentType: 1, isDeleted: 1 });
AttachmentSchema.index({ createdAt: -1, isDeleted: 1 });

// ─── Virtuals ───────────────────────────────────────────────────────
/**
 * Virtual: Get uploader details
 */
AttachmentSchema.virtual('uploadedBy', {
  ref: 'User',
  localField: 'uploadedByUserId',
  foreignField: '_id',
  justOne: true,
});

// ─── Transform ───────────────────────────────────────────────────────
/**
 * Transform schema output for API responses
 */
AttachmentSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type AttachmentDocument = Attachment & Document;
