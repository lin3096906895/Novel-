import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AccountDeletionService } from './account-deletion.service';
import { DataExportService } from './data-export.service';
import { CurrentUser } from './current-user.decorator';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ExportPersonalDataDto } from './dto/data-export.dto';
import { CancelAccountDeletionDto, RequestAccountDeletionDto } from './dto/account-deletion.dto';
import { LoginDto } from './dto/login.dto';
import { ListLoginActivitiesDto } from './dto/list-login-activities.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestEmailChangeCodeDto } from './dto/request-email-change-code.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { RequestRegistrationCodeDto } from './dto/request-registration-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  BeginTwoFactorSetupDto,
  EnableTwoFactorDto,
  ManageTwoFactorDto,
  VerifyTwoFactorLoginDto,
} from './dto/two-factor.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequestUser } from './auth.types';
import { TwoFactorService } from './two-factor.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
    private readonly accountDeletionService: AccountDeletionService,
    private readonly dataExportService: DataExportService,
  ) {}

  @Post('register/code')
  async requestRegistrationCode(@Body() dto: RequestRegistrationCodeDto, @Req() request: Request) {
    return {
      code: 0,
      message: '验证码已发送',
      data: await this.authService.requestRegistrationCode(dto, this.sessionMetadata(request)),
    };
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() request: Request) {
    return {
      code: 0,
      message: '注册成功',
      data: await this.authService.register(dto, this.sessionMetadata(request)),
    };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() request: Request) {
    const result = await this.authService.login(dto, this.sessionMetadata(request));
    return {
      code: 0,
      message: 'requiresTwoFactor' in result ? '请输入两步验证码' : '登录成功',
      data: result,
    };
  }

  @Post('two-factor/login')
  async completeTwoFactorLogin(@Body() dto: VerifyTwoFactorLoginDto) {
    return {
      code: 0,
      message: '登录成功',
      data: await this.authService.completeTwoFactorLogin(dto),
    };
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return {
      code: 0,
      message: '登录状态已续期',
      data: await this.authService.refresh(dto),
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: '已退出登录',
      data: await this.authService.logout(user),
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.authService.getProfile(user.id),
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto) {
    return {
      code: 0,
      message: '个人资料已更新',
      data: await this.authService.updateProfile(user.id, dto),
    };
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    return {
      code: 0,
      message: '密码已修改',
      data: await this.authService.changePassword(user, dto),
    };
  }

  @Get('two-factor')
  @UseGuards(JwtAuthGuard)
  async twoFactorStatus(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.twoFactorService.status(user.id),
    };
  }

  @Post('two-factor/setup')
  @UseGuards(JwtAuthGuard)
  async beginTwoFactorSetup(@CurrentUser() user: RequestUser, @Body() dto: BeginTwoFactorSetupDto) {
    return {
      code: 0,
      message: '请使用验证器扫描二维码',
      data: await this.twoFactorService.beginSetup(user, dto),
    };
  }

  @Delete('two-factor/setup')
  @UseGuards(JwtAuthGuard)
  async cancelTwoFactorSetup(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: '两步验证设置已取消',
      data: await this.twoFactorService.cancelSetup(user.id),
    };
  }

  @Post('two-factor/enable')
  @UseGuards(JwtAuthGuard)
  async enableTwoFactor(@CurrentUser() user: RequestUser, @Body() dto: EnableTwoFactorDto) {
    return {
      code: 0,
      message: '两步验证已启用',
      data: await this.twoFactorService.enable(user, dto.code),
    };
  }

  @Post('two-factor/recovery-codes')
  @UseGuards(JwtAuthGuard)
  async regenerateTwoFactorRecoveryCodes(
    @CurrentUser() user: RequestUser,
    @Body() dto: ManageTwoFactorDto,
  ) {
    return {
      code: 0,
      message: '恢复码已重新生成',
      data: await this.twoFactorService.regenerateRecoveryCodes(user, dto),
    };
  }

  @Delete('two-factor')
  @UseGuards(JwtAuthGuard)
  async disableTwoFactor(@CurrentUser() user: RequestUser, @Body() dto: ManageTwoFactorDto) {
    return {
      code: 0,
      message: '两步验证已关闭',
      data: await this.twoFactorService.disable(user, dto),
    };
  }

  @Get('account-deletion')
  @UseGuards(JwtAuthGuard)
  async accountDeletionStatus(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.accountDeletionService.status(user.id),
    };
  }

  @Post('account-deletion')
  @UseGuards(JwtAuthGuard)
  async requestAccountDeletion(
    @CurrentUser() user: RequestUser,
    @Body() dto: RequestAccountDeletionDto,
  ) {
    return {
      code: 0,
      message: '账号注销申请已提交',
      data: await this.accountDeletionService.request(user, dto),
    };
  }

  @Delete('account-deletion')
  @UseGuards(JwtAuthGuard)
  async cancelAccountDeletion(
    @CurrentUser() user: RequestUser,
    @Body() dto: CancelAccountDeletionDto,
  ) {
    return {
      code: 0,
      message: '账号注销申请已取消',
      data: await this.accountDeletionService.cancel(user, dto),
    };
  }

  @Post('data-export')
  @UseGuards(JwtAuthGuard)
  async exportPersonalData(@CurrentUser() user: RequestUser, @Body() dto: ExportPersonalDataDto) {
    return {
      code: 0,
      message: '个人数据已生成',
      data: await this.dataExportService.export(user, dto),
    };
  }

  @Post('password/forgot')
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto, @Req() request: Request) {
    return {
      code: 0,
      message: '如果该邮箱已注册，验证码将发送到邮箱',
      data: await this.authService.requestPasswordReset(dto, this.sessionMetadata(request)),
    };
  }

  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return {
      code: 0,
      message: '密码已重置，请重新登录',
      data: await this.authService.resetPassword(dto),
    };
  }

  @Post('email/change/code')
  @UseGuards(JwtAuthGuard)
  async requestEmailChangeCode(
    @CurrentUser() user: RequestUser,
    @Body() dto: RequestEmailChangeCodeDto,
    @Req() request: Request,
  ) {
    return {
      code: 0,
      message: '验证码已发送到新邮箱',
      data: await this.authService.requestEmailChangeCode(user, dto, this.sessionMetadata(request)),
    };
  }

  @Patch('email')
  @UseGuards(JwtAuthGuard)
  async changeEmail(@CurrentUser() user: RequestUser, @Body() dto: ChangeEmailDto) {
    return {
      code: 0,
      message: '登录邮箱已修改',
      data: await this.authService.changeEmail(user, dto),
    };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async sessions(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.authService.listSessions(user),
    };
  }

  @Get('login-activities')
  @UseGuards(JwtAuthGuard)
  async loginActivities(@CurrentUser() user: RequestUser, @Query() query: ListLoginActivitiesDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.authService.listLoginActivities(user, query),
    };
  }

  @Delete('sessions/others')
  @UseGuards(JwtAuthGuard)
  async revokeOtherSessions(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: '其他设备已退出',
      data: await this.authService.revokeOtherSessions(user),
    };
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  async revokeSession(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '设备会话已撤销',
      data: await this.authService.revokeSession(user, id),
    };
  }

  private sessionMetadata(request: Request) {
    const deviceHeader = request.headers['x-device-name'];
    return {
      deviceName: Array.isArray(deviceHeader) ? deviceHeader[0] : deviceHeader,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.socket.remoteAddress,
    };
  }
}
