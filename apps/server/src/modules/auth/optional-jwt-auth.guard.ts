import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard implements CanActivate {
  constructor(
    jwtService: JwtService,
    configService: ConfigService,
    usersService: UsersService,
    prisma: PrismaService,
  ) {
    super(jwtService, configService, usersService, prisma);
  }

  async canActivate(context: ExecutionContext) {
    try {
      return await super.canActivate(context);
    } catch {
      return true;
    }
  }
}
