export interface UserPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}
