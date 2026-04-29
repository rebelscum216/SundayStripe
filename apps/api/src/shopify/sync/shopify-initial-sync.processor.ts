import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ShopifyInitialSyncService } from './shopify-initial-sync.service.js';

type ShopifyInitialSyncJob = {
  syncJobId: string;
};

@Injectable()
@Processor('shopify-sync')
export class ShopifyInitialSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ShopifyInitialSyncProcessor.name);

  constructor(private readonly syncService: ShopifyInitialSyncService) {
    super();
  }

  async process(job: Job<ShopifyInitialSyncJob>): Promise<void> {
    if (job.name !== 'shopify_initial_sync') {
      this.logger.warn(`Ignoring unsupported Shopify sync job: ${job.name}`);
      return;
    }

    await this.syncService.run(job.data.syncJobId);
  }
}
