import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MerchantSyncService } from './merchant-sync.service.js';
import {
  MERCHANT_SYNC_QUEUE,
  type MerchantInitialSyncJob,
  type MerchantProductSyncJob,
} from './merchant.types.js';

@Injectable()
@Processor(MERCHANT_SYNC_QUEUE)
export class MerchantSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MerchantSyncProcessor.name);

  constructor(private readonly syncService: MerchantSyncService) {
    super();
  }

  async process(job: Job<MerchantInitialSyncJob | MerchantProductSyncJob>): Promise<void> {
    if (job.name === 'merchant_initial_sync') {
      await this.syncService.run((job as Job<MerchantInitialSyncJob>).data.syncJobId);
      return;
    }

    if (job.name === 'merchant_product_sync') {
      await this.syncService.syncProduct((job as Job<MerchantProductSyncJob>).data.productId);
      return;
    }

    this.logger.warn(`Ignoring unsupported Merchant sync job: ${job.name}`);
  }
}
