import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ShopifyOrdersSyncService } from './shopify-orders-sync.service.js';

type ShopifyOrdersSyncJob = {
  syncJobId: string;
};

@Injectable()
@Processor('shopify-orders-sync')
export class ShopifyOrdersSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ShopifyOrdersSyncProcessor.name);

  constructor(private readonly syncService: ShopifyOrdersSyncService) {
    super();
  }

  async process(job: Job<ShopifyOrdersSyncJob>): Promise<void> {
    if (job.name !== 'shopify_orders_sync') {
      this.logger.warn(`Ignoring unsupported Shopify orders sync job: ${job.name}`);
      return;
    }

    await this.syncService.run(job.data.syncJobId);
  }
}
