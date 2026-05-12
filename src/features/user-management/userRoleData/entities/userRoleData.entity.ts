import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRoleDataType } from '../dto/userRoleData.dto';

/**
 * User Role Data Schema
 * Stores additional role-specific data for users
 */
@Schema({ timestamps: true })
export class UserRoleData {
  @Prop({
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(UserRoleDataType),
    required: [true, 'Type is required'],
  })
  type: UserRoleDataType;

  @Prop({ type: String, required: true })
  data: string;

  @Prop({ default: false })
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserRoleDataSchema = SchemaFactory.createForClass(UserRoleData);

export type UserRoleDataDocument = UserRoleData & Document;
