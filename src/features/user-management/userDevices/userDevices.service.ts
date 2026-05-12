import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { GenericService } from '../../../common/generic/generic.service';
import { UserDevices, UserDevicesDocument, DeviceType } from './userDevices.schema';

/**
 * UserDevices Service
 * 
 * Manages user devices for push notifications
 * Extends GenericService for CRUD operations
 */
@Injectable()
export class UserDevicesService extends GenericService<typeof UserDevices, UserDevicesDocument> {
  constructor(
    @InjectModel(UserDevices.name) deviceModel: Model<UserDevicesDocument>,
  ) {
    super(deviceModel);
  }

  /**
   * Register or update device
   */
  async registerOrUpdateDevice(
    userId: string,
    fcmToken: string,
    deviceType: DeviceType,
    deviceName?: string,
  ): Promise<UserDevicesDocument> {
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
  async getUserDevices(userId: string): Promise<UserDevicesDocument[]> {
    return this.model.find({
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    }).sort({ lastActive: -1 }).lean().exec();
  }

  /**
   * Get device by FCM token
   */
  async getDeviceByToken(fcmToken: string): Promise<UserDevicesDocument | null> {
    return this.model.findOne({
      fcmToken,
      isDeleted: false,
    }).lean().exec();
  }

  /**
   * Update last active timestamp
   */
  async updateLastActive(deviceId: string): Promise<UserDevicesDocument | null> {
    return this.model.findByIdAndUpdate(
      deviceId,
      { lastActive: new Date() },
      { new: true },
    ).lean().exec();
  }

  /**
   * Remove device (soft delete)
   */
  async removeDevice(userId: string, deviceId: string): Promise<UserDevicesDocument | null> {
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
  async getActiveDevices(userId: string): Promise<UserDevicesDocument[]> {
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
  async updatePushEnabled(deviceId: string, enabled: boolean): Promise<UserDevicesDocument | null> {
    return this.model.findByIdAndUpdate(
      deviceId,
      { pushEnabled: enabled },
      { new: true },
    ).lean().exec();
  }
}
