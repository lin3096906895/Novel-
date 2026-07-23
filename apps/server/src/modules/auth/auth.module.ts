import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { AuthMailService } from './auth-mail.service';
import { RolesGuard } from './roles.guard';
import { TwoFactorService } from './two-factor.service';
import { AccountDeletionRunner } from './account-deletion.runner';
import { AccountDeletionService } from './account-deletion.service';
import { DataExportService } from './data-export.service';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthMailService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
    TwoFactorService,
    AccountDeletionService,
    AccountDeletionRunner,
    DataExportService,
  ],
  exports: [AuthService, JwtModule, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard, UsersModule],
})
export class AuthModule {}
