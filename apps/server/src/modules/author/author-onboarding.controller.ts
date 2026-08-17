import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthorOnboardingService } from './author-onboarding.service';
import { SubmitAuthorApplicationDto } from './dto/submit-author-application.dto';
import { UpdateAuthorProfileDto } from './dto/update-author-profile.dto';

@Controller('author')
@UseGuards(JwtAuthGuard)
export class AuthorOnboardingController {
  constructor(private readonly onboardingService: AuthorOnboardingService) {}

  @Get('onboarding')
  async getStatus(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.onboardingService.getStatus(user),
    };
  }

  @Post('onboarding')
  async submit(
    @CurrentUser() user: RequestUser,
    @Body() dto: SubmitAuthorApplicationDto,
  ) {
    return {
      code: 0,
      message: '作者申请已提交',
      data: await this.onboardingService.submit(user, dto),
    };
  }

  @Patch('profile')
  @UseGuards(RolesGuard)
  @Roles(UserRole.AUTHOR)
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAuthorProfileDto,
  ) {
    return {
      code: 0,
      message: '作者资料已更新',
      data: await this.onboardingService.updateProfile(user, dto),
    };
  }
}
