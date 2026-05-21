import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserAuthProvider } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OAuthLoginDto, OAuthProvider } from './dto/oauth-login.dto';
import { OtpService } from '../otp/otp.service';
import { EmailService } from '../email/email.service';
import { OAuthVerificationService } from '../oauth/oauth-verification.service';
import { RedisService } from '@app/redis';
import { PrismaService } from '@app/database';
import { OtpType } from '../otp/interfaces/otp-payload.interface';

const authUserSelect = {
  id: true,
  name: true,
  email: true,
  password: true,
  role: true,
  profileImageUrl: true,
  isDeleted: true,
} satisfies Prisma.UserSelect;

type AuthUserRecord = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

@Injectable()
export class AuthService {
  private readonly TOKEN_BLACKLIST_PREFIX = 'blacklist:token:';
  private readonly TOKEN_BLACKLIST_TTL = 7 * 24 * 60 * 60; // 7 days

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
    private readonly oauthVerificationService: OAuthVerificationService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Login user
   */
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), isDeleted: false },
      select: authUserSelect,
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
      },
      ...tokens,
    };
  }

  /**
   * Register new user
   */
  async register(registerDto: RegisterDto) {
    const { name, email, password, role, phoneNumber } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role,
        phoneNumber,
        isEmailVerified: false,
      },
    });

    const otp = await this.otpService.createOtp(email, OtpType.VERIFY);
    await this.emailService.sendOtpEmail(email, otp, OtpType.VERIFY);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      message: 'Registration successful. Please verify your email.',
      ...(process.env.NODE_ENV === 'development' && { otp }),
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string) {
    const client = await this.redisService.getClient();
    if (client) {
      const isBlacklisted = await client.get(`${this.TOKEN_BLACKLIST_PREFIX}${refreshToken}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }
    }

    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: authUserSelect,
      });

      if (!user || user.isDeleted) {
        throw new UnauthorizedException('User not found');
      }

      const tokens = await this.generateTokens(user);
      await this.blacklistToken(refreshToken);

      return tokens;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout user
   */
  async logout(refreshToken: string) {
    await this.blacklistToken(refreshToken);
    return { message: 'Logout successful' };
  }

  /**
   * Forgot password
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), isDeleted: false },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const otp = await this.otpService.createOtp(email, OtpType.RESET);
    await this.emailService.sendOtpEmail(email, otp, OtpType.RESET);

    return { message: 'Password reset OTP sent to your email' };
  }

  /**
   * Verify OTP
   */
  async verifyOtp(email: string, otp: string, type: OtpType) {
    return await this.otpService.verifyOtp(email, otp, type);
  }

  /**
   * Reset password
   */
  async resetPassword(email: string, otp: string, newPassword: string) {
    await this.otpService.verifyOtp(email, otp, OtpType.RESET);
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { password: hashedPassword },
    });

    return { message: 'Password reset successful' };
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(user: Pick<AuthUserRecord, 'id' | 'email' | 'role'>) {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Blacklist token
   */
  private async blacklistToken(token: string, ttl?: number) {
    const client = await this.redisService.getClient();
    if (client) {
      await client.set(
        `${this.TOKEN_BLACKLIST_PREFIX}${token}`,
        'blacklisted',
        'EX',
        ttl || this.TOKEN_BLACKLIST_TTL,
      );
    }
  }

  /**
   * OAuth login
   */
  async oauthLogin(oauthLoginDto: OAuthLoginDto) {
    const { provider, idToken, role } = oauthLoginDto;

    let email: string;
    let name: string;
    let profileImage: string | undefined;

    if (provider === OAuthProvider.GOOGLE) {
      const payload = await this.oauthVerificationService.verifyGoogleIdToken(idToken);
      email = payload.email;
      name = payload.name;
      profileImage = payload.picture;
    } else if (provider === OAuthProvider.APPLE) {
      const payload = await this.oauthVerificationService.verifyAppleIdToken(idToken);
      email = payload.email;
      name = payload.name;
    } else {
      throw new BadRequestException('Invalid OAuth provider');
    }

    let user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      if (user.isDeleted) {
        throw new UnauthorizedException('Account has been deleted');
      }
    } else {
      if (!role) {
        throw new BadRequestException('Role is required for new OAuth users');
      }

      user = await this.prisma.user.create({
        data: {
          name: name || email.split('@')[0],
          email: email.toLowerCase(),
          role: role as Prisma.UserCreateInput['role'],
          isEmailVerified: true,
          authProvider: provider as UserAuthProvider,
          profileImageUrl: profileImage,
        },
      });
    }

    const tokens = await this.generateTokens(user);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
      },
      ...tokens,
    };
  }
}
