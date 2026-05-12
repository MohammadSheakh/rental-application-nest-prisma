import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNotEmpty, IsOptional } from 'class-validator';
import { TAdminStatus, TProviderApprovalStatus } from '../userRoleData.schema';

export class CreateUserRoleDataDto {
  @ApiProperty({ description: 'User ID' })
  @IsNotEmpty()
  @IsMongoId()
  userId: string;

  @ApiPropertyOptional({ enum: TAdminStatus })
  @IsOptional()
  @IsEnum(TAdminStatus)
  adminStatus?: TAdminStatus;

  @ApiPropertyOptional({ enum: TProviderApprovalStatus })
  @IsOptional()
  @IsEnum(TProviderApprovalStatus)
  providerApprovalStatus?: TProviderApprovalStatus;
}

export class UpdateUserRoleDataDto {
  @ApiPropertyOptional({ enum: TAdminStatus })
  @IsOptional()
  @IsEnum(TAdminStatus)
  adminStatus?: TAdminStatus;

  @ApiPropertyOptional({ enum: TProviderApprovalStatus })
  @IsOptional()
  @IsEnum(TProviderApprovalStatus)
  providerApprovalStatus?: TProviderApprovalStatus;
}
