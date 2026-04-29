import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MerchantSyncService } from './merchant-sync.service.js';
import { MERCHANT_SYNC_QUEUE, type MerchantInitialSyncJob } from './merchant.types.js';

@Injectable()
@Processor(MERCHANT_SYNC_QUEUE)
export class MerchantSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MerchantSyncProcessor.name);

  constructor(private readonly syncService: MerchantSyncService) {
    super();
  }

  async process(job: Job<MerchantInitialSyncJob>): Promise<void> {
    if (job.name !== 'merchant_initial_sync') {
      this.logger.warn(`Ignoring unsupported Merchant sync job: ${job.name}`);
      return;
    }

    await this.syncService.run(job.data.syncJobId);
  }
}
