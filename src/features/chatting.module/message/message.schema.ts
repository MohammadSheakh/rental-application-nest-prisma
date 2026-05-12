import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Message Document
 *
 * 📚 MESSAGE SCHEMA
 *
 * Compatible with Express.js message.model.ts
 */
@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class Message extends Document {
  @ApiProperty({ description: 'Message text' })
  @Prop({ type: String, required: true })
  text: string;

  @ApiProperty({ description: 'Attachment IDs', required: false })
  @Prop([{
    type: MongooseSchema.Types.ObjectId,
    ref: 'Attachment',
  }])
  attachments: Types.ObjectId[];

  @ApiProperty({ description: 'Sender user ID' })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  senderId: Types.ObjectId;

  @ApiProperty({ description: 'Conversation ID' })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  })
  conversationId: Types.ObjectId;

  @ApiProperty({ description: 'Is deleted flag' })
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @ApiProperty({ description: 'Created at' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated at' })
  updatedAt: Date;

  /**
   * Virtual property for message ID
   */
  @ApiProperty({ description: 'Message ID' })
  get _messageId(): string {
    return this._id.toString();
  }
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes for performance
MessageSchema.index({ conversationId: 1, createdAt: -1, isDeleted: 1 });
MessageSchema.index({ senderId: 1, isDeleted: 1 });
MessageSchema.index({ createdAt: -1, isDeleted: 1 });

// Virtual populate for sender
MessageSchema.virtual('sender', {
  ref: 'User',
  localField: 'senderId',
  foreignField: '_id',
  justOne: true,
});

// Transform to JSON
MessageSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret._messageId = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type MessageDocument = Message & {
  _id: Types.ObjectId;
};
