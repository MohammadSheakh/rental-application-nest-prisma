import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GenericService } from '../../../common/generic/generic.service';
import { UserRoleData, UserRoleDataDocument } from './userRoleData.schema';

@Injectable()
export class UserRoleDataService extends GenericService<typeof UserRoleData, UserRoleDataDocument> {
  constructor(
    @InjectModel(UserRoleData.name) userRoleDataModel: Model<UserRoleDataDocument>,
  ) {
    super(userRoleDataModel);
  }
}
