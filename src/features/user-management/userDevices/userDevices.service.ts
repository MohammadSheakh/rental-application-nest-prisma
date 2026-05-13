import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {Prisma} from '@prisma/client';
import { GenericService } from '../../../common/generic/generic.service';
import { PrismaModule } from 'src/core/database/prisma/prisma.module';
import { PrismaService } from 'src/core/database/prisma/prisma.service';
import { DeviceType } from './enums/TDevice.enum';
// import { UserDevices, UserDevicesDocument, DeviceType } from './userDevices.schema';

const publicUserDeviceSelect = {
  id: true,

  isDeleted: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * UserDevices Service
 * 
 * Manages user devices for push notifications
 * Extends GenericService for CRUD operations
 */
@Injectable()
export class UserDevicesService extends GenericService</*typeof UserDevices*/ any, Partial<Prisma.UserDevices>> {
  constructor(
    private readonly prisma: PrismaService,
    // @InjectModel(UserDevices.name) deviceModel: Model<UserDevicesDocument>,
  ) {
    // super(deviceModel);
    super((prisma as any).userDevices, publicUserDeviceSelect);
  }

  /**
   * Register or update device
   */
  async registerOrUpdateDevice(
    userId: string,
    fcmToken: string,
    deviceType: DeviceType,
    deviceName?: string,
  ): Promise<Prisma.UserDevices> {
    // Find existing device with same FCM token
    const existingDevice = await this.model.findOne({
      fcmToken,
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    }).exec();

    if (existingDevice) {
      // Update existing device
      existingDevice.lastActive = new Date();
      existingDevice.deviceType = deviceType;
      existingDevice.deviceName = deviceName || existingDevice.deviceName;
      return existingDevice.save();
    }

    // Create new device
    return this.model.create({
      userId: new Types.ObjectId(userId),
      fcmToken,
      deviceType,
      deviceName,
      lastActive: new Date(),
    });
  }

  /**
   * Get all devices for user
   */
  async getUserDevices(userId: string): Promise<Prisma.UserDevices[]> {
    return this.model.find({
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    }).sort({ lastActive: -1 }).lean().exec();
  }

  /**
   * Get device by FCM token
   */
  async getDeviceByToken(fcmToken: string): Promise<Prisma.UserDevices | null> {
    return this.model.findOne({
      fcmToken,
      isDeleted: false,
    }).lean().exec();
  }

  /**
   * Update last active timestamp
   */
  async updateLastActive(deviceId: string): Promise<Prisma.UserDevices | null> {
    return this.model.findByIdAndUpdate(
      deviceId,
      { lastActive: new Date() },
      { new: true },
    ).lean().exec();
  }

  /**
   * Remove device (soft delete)
   */
  async removeDevice(userId: string, deviceId: string): Promise<Prisma.UserDevices | null> {
    const device = await this.model.findOne({
      _id: deviceId,
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    }).exec();

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return this.model.findByIdAndUpdate(
      deviceId,
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
      { new: true },
    ).lean().exec();
  }

  /**
   * Remove device by FCM token
   */
  async removeDeviceByToken(userId: string, fcmToken: string): Promise<void> {
    await this.model.updateOne(
      {
        fcmToken,
        userId: new Types.ObjectId(userId),
      },
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
    ).exec();
  }

  /**
   * Get all active devices for user (for push notifications)
   */
  async getActiveDevices(userId: string): Promise<Prisma.UserDevices[]> {
    return this.model.find({
      userId: new Types.ObjectId(userId),
      pushEnabled: true,
      isDeleted: false,
    }).lean().exec();
  }

  /**
   * Cleanup old inactive devices (older than 1 year)
   */
  async cleanupInactiveDevices(): Promise<number> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const result = await this.model.updateMany(
      {
        lastActive: { $lt: oneYearAgo },
        isDeleted: false,
      },
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
    ).exec();

    return result.modifiedCount;
  }

  /**
   * Enable/disable push notifications for device
   */
  async updatePushEnabled(deviceId: string, enabled: boolean): Promise<Prisma.UserDevices | null> {
    return this.model.findByIdAndUpdate(
      deviceId,
      { pushEnabled: enabled },
      { new: true },
    ).lean().exec();
  }
}
