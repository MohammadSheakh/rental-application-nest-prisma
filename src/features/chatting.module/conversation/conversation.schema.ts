import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { ConversationType } from './conversation.constant';

/**
 * Conversation Document
 *
 * 📚 CONVERSATION SCHEMA
 *
 * Compatible with Express.js conversation.model.ts
 */
@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class Conversation extends Document {
  @ApiProperty({ description: 'Creator user ID' })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  creatorId: Types.ObjectId;

  @ApiProperty({
    description: 'Conversation type',
    enum: ConversationType,
  })
  @Prop({
    type: String,
    enum: [ConversationType.DIRECT, ConversationType.GROUP],
    required: true,
  })
  type: ConversationType;

  @ApiProperty({ description: 'Group name (for group conversations)', required: false })
  @Prop({ type: String, default: null })
  groupName: string;

  @ApiProperty({ description: 'Group profile picture URL', required: false })
  @Prop({ type: String, default: null })
  groupProfilePicture: string;

  @ApiProperty({ description: 'Last message ID', required: false })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Message',
    default: null,
  })
  lastMessageId: Types.ObjectId;

  @ApiProperty({ description: 'Last message text', required: false })
  @Prop({ type: String, default: null })
  lastMessage: string;

  @ApiProperty({ description: 'Last message created at' })
  @Prop({ type: Date })
  lastMessageCreatedAt: Date;

  @ApiProperty({ description: 'Is deleted flag' })
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @ApiProperty({ description: 'Created at' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated at' })
  updatedAt: Date;

  /**
   * Virtual property for conversation ID
   */
  @ApiProperty({ description: 'Conversation ID' })
  get _conversationId(): string {
    return this._id.toString();
  }
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes for performance
ConversationSchema.index({ creatorId: 1, isDeleted: 1 });
ConversationSchema.index({ type: 1, isDeleted: 1 });
ConversationSchema.index({ lastMessageCreatedAt: -1, isDeleted: 1 });

// Virtual populate for participants
ConversationSchema.virtual('participants', {
  ref: 'ConversationParticipents',
  localField: '_id',
  foreignField: 'conversationId',
});

// Virtual populate for messages
ConversationSchema.virtual('messages', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'conversationId',
  options: { sort: { createdAt: -1 } },
});

// Transform to JSON
ConversationSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret._conversationId = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type ConversationDocument = Conversation & {
  _id: Types.ObjectId;
};
