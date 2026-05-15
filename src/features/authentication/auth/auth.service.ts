import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserAuthProvider } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Redis } from 'ioredis';


import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OAuthLoginDto, OAuthProvider } from './dto/oauth-login.dto';
import { OtpService } from '../otp/otp.service';
import { EmailService } from '../email/email.service';
import { OAuthVerificationService } from '../oauth/oauth-verification.service';
import { REDIS_CLIENT } from 'src/core/database/redis/redis.constants';
import { PrismaService } from 'src/core/database/prisma/prisma.service';
import { OtpType } from '../otp/interfaces/otp-payload.interface';

type AuthUser = Prisma.UserGetPayload<{
  select: {
    id: true;
    name: true;
    email: true;
    password: true;
    role: true;
    profileImageUrl: true;
    isDeleted: true;
  };
}>;


/**
 * Auth Service
 * 
 * 📚 EXPRESS → NESTJS TRANSITION
 * 
 * Express Pattern:
 * - const login = async (email, password) => { ... }
 * - Manual bcrypt comparison
 * - Manual token generation
 * - Direct model calls: User.findOne()
 * 
 * NestJS Pattern:
 * - @Injectable() decorator
 * - Constructor dependency injection
 * - @InjectModel for Mongoose
 * - Service-based architecture
 * 
 * Key Benefits:
 * ✅ Automatic dependency injection
 * ✅ Better testability (mock services)
 * ✅ Cleaner code (no manual instantiation)
 * ✅ Type-safe (TypeScript)
 */
@Injectable()
export class AuthService {
  private readonly TOKEN_BLACKLIST_PREFIX = 'blacklist:token:';
  private readonly TOKEN_BLACKLIST_TTL = 7 * 24 * 60 * 60; // 7 days

  constructor(
    // @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly prisma: PrismaService,   // ← replaces @InjectModel
    private jwtService: JwtService,
    private otpService: OtpService,
    private emailService: EmailService,
    private oauthVerificationService: OAuthVerificationService,
    @Inject(REDIS_CLIENT) private redisClient: Redis,
  ) {}

  /**
   * Login user
   */
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user with password field
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), isDeleted: false },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        profileImageUrl: true,
        isDeleted: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is deleted
    if (user.isDeleted) {
      throw new UnauthorizedException('Your account has been deleted');
    }

    // Verify password
    if (!user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
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

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
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

    // Create OTP for email verification
    const otp = await this.otpService.createOtp(email, OtpType.VERIFY);

    // Send email with OTP
    await this.emailService.sendOtpEmail(email, otp, OtpType.VERIFY);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      message: 'Registration successful. Please verify your email.',
      // OTP only returned in development for testing
      ...(process.env.NODE_ENV === 'development' && { otp }),
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string) {
    // Check if token is blacklisted
    const isBlacklisted = await this.redisClient.get(
      `${this.TOKEN_BLACKLIST_PREFIX}${refreshToken}`,
    );

    if (isBlacklisted) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    try {
      // Verify refresh token
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      // Find user
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || user.isDeleted) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      // Blacklist old refresh token
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
    // Blacklist the refresh token
    await this.blacklistToken(refreshToken);

    return { message: 'Logout successful' };
  }

  /**
   * Forgot password - send OTP
   */
  async forgotPassword(email: string) {
    // Find user
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), isDeleted: false },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create OTP
    const otp = await this.otpService.createOtp(email, OtpType.RESET);

    // Send email with OTP
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
    // Verify OTP
    await this.otpService.verifyOtp(email, otp, OtpType.RESET);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await this.prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { password: hashedPassword },
    });

    return { message: 'Password reset successful' };
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(user: Pick<AuthUser, 'id' | 'email' | 'role'>) {
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
    await this.redisClient.set(
      `${this.TOKEN_BLACKLIST_PREFIX}${token}`,
      'blacklisted',
      'EX',
      ttl || this.TOKEN_BLACKLIST_TTL,
    );
  }

  /**
   * OAuth login (Google/Apple)
   */
  async oauthLogin(oauthLoginDto: OAuthLoginDto) {
    const { provider, idToken, role } = oauthLoginDto;

    let email: string;
    let name: string;
    let profileImage: string | undefined;

    // Verify OAuth token and extract user info
    if (provider === OAuthProvider.GOOGLE) {
      const payload = await this.verifyGoogleIdToken(idToken);
      email = payload.email;
      name = payload.name;
      profileImage = payload.picture;
    } else if (provider === OAuthProvider.APPLE) {
      const payload = await this.verifyAppleIdToken(idToken);
      email = payload.email;
      name = payload.name;
    } else {
      throw new BadRequestException('Invalid OAuth provider');
    }

    // Find or create user
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

  /**
   * Verify Google ID token
   */
  private async verifyGoogleIdToken(idToken: string): Promise<any> {
    // Production: Uses google-auth-library
    // Development: Mock verification
    return await this.oauthVerificationService.verifyGoogleIdToken(idToken);
  }

  /**
   * Verify Apple ID token
   */
  private async verifyAppleIdToken(idToken: string): Promise<any> {
    // Production: Uses apple-signin-auth
    // Development: Mock verification
    return await this.oauthVerificationService.verifyAppleIdToken(idToken);
  }
}
