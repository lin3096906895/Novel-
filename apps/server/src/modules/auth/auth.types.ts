import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  sid: string;
}

export interface RequestUser {
  id: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

export interface SessionMetadata {
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
}
