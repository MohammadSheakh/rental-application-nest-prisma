import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { GenericService } from '../../../common/generic/generic.service';
import { OAuthAccount, OAuthAccountDocument, AuthProvider } from './oauthAccount.schema';

/**
 * OAuthAccount Service
 * 
 * Manages OAuth provider accounts linked to users
 * Extends GenericService for CRUD operations
 */
@Injectable()
export class OAuthAccountService extends GenericService<typeof OAuthAccount, OAuthAccountDocument> {
  constructor(
    @InjectModel(OAuthAccount.name) oauthModel: Model<OAuthAccountDocument>,
  ) {
    super(oauthModel);
  }

  /**
   * Find OAuth account by provider and provider ID
   */
  async findByProvider(
    authProvider: AuthProvider,
    providerId: string,
  ): Promise<OAuthAccountDocument | null> {
    return this.model.findOne({
      authProvider,
      providerId,
      isDeleted: false,
    }).lean().exec();
  }

  /**
   * Find OAuth account by user ID
   */
  async findByUserId(userId: string): Promise<OAuthAccountDocument[]> {
    return this.model.find({
      userId: new Types.ObjectId(userId),
      isDeleted: false,
    }).lean().exec();
  }

  /**
   * Create or link OAuth account
   */
  async createOrLinkOAuthAccount(
    userId: string,
    authProvider: AuthProvider,
    providerId: string,
    email: string,
    accessToken?: string,
    refreshToken?: string,
    idToken?: string,
  ): Promise<OAuthAccountDocument> {
    // Check if OAuth account already exists
    const existing = await this.findByProvider(authProvider, providerId);

    if (existing) {
      throw new ConflictException('OAuth account already exists');
    }

    // Create new OAuth account
    return this.model.create({
      userId: new Types.ObjectId(userId),
      authProvider,
      providerId,
      email: email.toLowerCase(),
      accessToken,
      refreshToken,
      idToken,
      isVerified: true,
      lastUsedAt: new Date(),
    });
  }

  /**
   * Link OAuth account to existing user
   */
  async linkOAuthAccount(
    userId: string,
    authProvider: AuthProvider,
    providerId: string,
    email: string,
    accessToken?: string,
  ): Promise<OAuthAccountDocument> {
    // Check if user already has this OAuth provider
    const existing = await this.model.findOne({
      userId: new Types.ObjectId(userId),
      authProvider,
      isDeleted: false,
    }).exec();

    if (existing) {
      throw new ConflictException('User already has this OAuth provider linked');
    }

    // Create OAuth account
    return this.model.create({
      userId: new Types.ObjectId(userId),
      authProvider,
      providerId,
      email: email.toLowerCase(),
      accessToken,
      isVerified: true,
      lastUsedAt: new Date(),
    });
  }

  /**
   * Update OAuth account last used timestamp
   */
  async updateLastUsed(oauthAccountId: string): Promise<OAuthAccountDocument | null> {
    return this.model.findByIdAndUpdate(
      oauthAccountId,
      { lastUsedAt: new Date() },
      { new: true },
    ).lean().exec();
  }

  /**
   * Unlink OAuth account from user
   */
  async unlinkOAuthAccount(userId: string, authProvider: AuthProvider): Promise<void> {
    const result = await this.model.updateOne(
      {
        userId: new Types.ObjectId(userId),
        authProvider,
      },
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
    ).exec();

    if (result.modifiedCount === 0) {
      throw new NotFoundException('OAuth account not found');
    }
  }

  /**
   * Get all OAuth accounts for user
   */
  async getUserOAuthAccounts(userId: string): Promise<{
    google: boolean;
    apple: boolean;
  }> {
    const accounts = await this.findByUserId(userId);

    return {
      google: accounts.some(acc => acc.authProvider === AuthProvider.GOOGLE),
      apple: accounts.some(acc => acc.authProvider === AuthProvider.APPLE),
    };
  }

  /**
   * Check if user has OAuth account
   */
  async hasOAuthAccount(userId: string, authProvider: AuthProvider): Promise<boolean> {
    const account = await this.model.findOne({
      userId: new Types.ObjectId(userId),
      authProvider,
      isDeleted: false,
    }).exec();

    return !!account;
  }
}
