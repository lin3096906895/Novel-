import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminAuditService } from './admin-audit.service';
import { ListAdminAuditLogsDto } from './dto/list-admin-audit-logs.dto';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  @Get()
  async list(@Query() query: ListAdminAuditLogsDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.auditService.list(query),
    };
  }
}
