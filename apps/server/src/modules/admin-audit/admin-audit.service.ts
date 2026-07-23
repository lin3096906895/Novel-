import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminAuditLogsDto } from './dto/list-admin-audit-logs.dto';

export interface RecordAdminAuditInput {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAdminAuditLogsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const keyword = query.keyword?.trim();
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(keyword
        ? {
            OR: [
              { summary: { contains: keyword, mode: 'insensitive' } },
              { targetId: { contains: keyword, mode: 'insensitive' } },
              { actor: { nickname: { contains: keyword, mode: 'insensitive' } } },
              { actor: { email: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, nickname: true, email: true, role: true } },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  record(input: RecordAdminAuditInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.adminAuditLog.create({ data: input });
  }
}
