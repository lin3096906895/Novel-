import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service';

@Injectable()
export class AccountDeletionRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly accountDeletionService: AccountDeletionService) {}

  onModuleInit() {
    void this.processDueAccounts();
    this.timer = setInterval(() => void this.processDueAccounts(), 5000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async processDueAccounts() {
    try {
      const completed = await this.accountDeletionService.processDueAccounts();
      if (completed.length > 0) {
        this.logger.log(`Completed ${completed.length} account deletion(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Account deletion processing failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
