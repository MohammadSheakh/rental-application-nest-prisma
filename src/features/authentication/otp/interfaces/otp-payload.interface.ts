/**
 * OTP Payload Interface
 * Stored in Redis with TTL
 */
export interface IOtpPayload {
  otp: string;
  createdAt: number;
  attempts: number;
}

/**
 * OTP Type Enum
 */
export enum OtpType {
  VERIFY = 'verify',
  RESET = 'reset',
}
