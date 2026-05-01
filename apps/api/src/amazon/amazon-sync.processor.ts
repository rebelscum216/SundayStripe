import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AmazonSyncService } from './amazon-sync.service.js';
import { AMAZON_SYNC_QUEUE, type AmazonInitialSyncJob } from './amazon.types.js';

@Injectable()
@Processor(AMAZON_SYNC_QUEUE, {
  lockDuration: 600_000, // 10 minutes — sync can take several minutes with per-SKU fetches
  concurrency: 1,        // never run two Amazon sync jobs simultaneously
})
export class AmazonSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(AmazonSyncProcessor.name);

  constructor(private readonly syncService: AmazonSyncService) {
    super();
  }

  async process(job: Job<AmazonInitialSyncJob>): Promise<void> {
    if (job.name !== 'amazon_initial_sync') {
      this.logger.warn(`Ignoring unsupported Amazon sync job: ${job.name}`);
      return;
    }

    await this.syncService.run(job.data.syncJobId);
  }
}
