import { UserRole, UserStatus } from '@prisma/client';

export interface UserResponse {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: Date;
  deletionRequestedAt?: Date | null;
  deletionScheduledAt?: Date | null;
}

export function toUserResponse(user: {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt?: Date | null;
  createdAt: Date;
  deletionRequestedAt?: Date | null;
  deletionScheduledAt?: Date | null;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt,
    deletionRequestedAt: user.deletionRequestedAt ?? null,
    deletionScheduledAt: user.deletionScheduledAt ?? null,
  };
}
