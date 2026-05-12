import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { IBaseEntity } from '../../../common/base/base.entity';

export enum TAdminStatus {
  active = 'active',
  inactive = 'inactive',
}

export enum TProviderApprovalStatus {
  accept = 'accept',
  reject = 'reject',
  pending = 'pending',
  requested = 'requested',
}

@Schema({ 
  timestamps: true, 
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class UserRoleData extends IBaseEntity {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: TAdminStatus })
  adminStatus?: TAdminStatus;

  @Prop({ type: String, enum: TProviderApprovalStatus })
  providerApprovalStatus?: TProviderApprovalStatus;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const UserRoleDataSchema = SchemaFactory.createForClass(UserRoleData);

// ─── Virtuals ───────────────────────────────────────────────────────
UserRoleDataSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

// ─── Transform ───────────────────────────────────────────────────────
UserRoleDataSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.userRoleDataId = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export type UserRoleDataDocument = UserRoleData & Document;
