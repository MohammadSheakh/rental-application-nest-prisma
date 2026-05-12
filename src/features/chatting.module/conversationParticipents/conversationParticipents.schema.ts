import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { ParticipantRole } from './conversation.constant';

/**
 * Conversation Participents Document
 *
 * 📚 CONVERSATION PARTICIPENTS SCHEMA
 *
 * Compatible with Express.js conversationParticipents.model.ts
 */
@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class ConversationParticipents extends Document {
  @ApiProperty({ description: 'User ID' })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: Types.ObjectId;

  @ApiProperty({ description: 'User name' })
  @Prop({ type: String, required: true })
  userName: string;

  @ApiProperty({ description: 'Conversation ID' })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  })
  conversationId: Types.ObjectId;

  @ApiProperty({ description: 'Joined at' })
  @Prop({ type: Date, default: Date.now })
  joinedAt: Date;

  @ApiProperty({
    description: 'Role in conversation',
    enum: ParticipantRole,
  })
  @Prop({
    type: String,
    enum: [ParticipantRole.ADMIN, ParticipantRole.MEMBER],
    required: true,
  })
  role: ParticipantRole;

  @ApiProperty({ description: 'Last message read at', required: false })
  @Prop({ type: Date, required: false })
  lastMessageReadAt: Date;

  @ApiProperty({ description: 'Last message read ID', required: false })
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Message',
    required: false,
  })
  lastMessageReadId: Types.ObjectId;

  @ApiProperty({ description: 'Unread count', required: false })
  @Prop({ type: Number, required: false, default: 0 })
  unreadCount: number;

  @ApiProperty({ description: 'Is conversation unseen', required: false })
  @Prop({ type: Number, required: false, default: 0, min: 0, max: 1 })
  isThisConversationUnseen: number;

  @ApiProperty({ description: 'Is deleted flag' })
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @ApiProperty({ description: 'Created at' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated at' })
  updatedAt: Date;

  /**
   * Virtual property for participents ID
   */
  @ApiProperty({ description: 'Participents ID' })
  get _conversationParticipentsId(): string {
    return this._id.toString();
  }
}

export const ConversationParticipentsSchema = SchemaFactory.createForClass(ConversationParticipents);

// Indexes for performance
ConversationParticipentsSchema.index({ userId: 1, conversationId: 1, isDeleted: 1 });
ConversationParticipentsSchema.index({ conversationId: 1, isDeleted: 1 });
ConversationParticipentsSchema.index({ userId: 1, isDeleted: 1 });

// Transform to JSON
ConversationParticipentsSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret._conversationParticipentsId = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type ConversationParticipentsDocument = ConversationParticipents & {
  _id: Types.ObjectId;
};
