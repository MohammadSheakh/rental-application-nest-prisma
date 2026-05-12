import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Message Read Status Document
 *
 * 📚 MESSAGE READ STATUS SCHEMA
 *
 * Tracks which users have read which messages
 * Compatible with Express.js messageReadStatus model
 */
@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class MessageReadStatus extends Document {
  @ApiProperty({ description: 'Message ID' })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Message',
    required: true,
  })
  messageId: Types.ObjectId;

  @ApiProperty({ description: 'User ID who read the message' })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: Types.ObjectId;

  @ApiProperty({ description: 'Conversation ID' })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  })
  conversationId: Types.ObjectId;

  @ApiProperty({ description: 'Is read flag' })
  @Prop({ type: Boolean, default: false })
  isRead: boolean;

  @ApiProperty({ description: 'Read at timestamp' })
  @Prop({ type: Date })
  readAt: Date;

  @ApiProperty({ description: 'Is deleted flag' })
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @ApiProperty({ description: 'Created at' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated at' })
  updatedAt: Date;
}

export const MessageReadStatusSchema = SchemaFactory.createForClass(MessageReadStatus);

// Indexes for performance
MessageReadStatusSchema.index({ messageId: 1, userId: 1, isDeleted: 1 });
MessageReadStatusSchema.index({ conversationId: 1, userId: 1, isRead: 1 });
MessageReadStatusSchema.index({ userId: 1, isRead: 1 });

// Unique constraint - one read status per user per message
MessageReadStatusSchema.index({ messageId: 1, userId: 1 }, { unique: true });

// Transform to JSON
MessageReadStatusSchema.set('toJSON', {
  transform: function (doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type MessageReadStatusDocument = MessageReadStatus & {
  _id: Types.ObjectId;
};
