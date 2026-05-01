import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { GscSyncService } from './gsc-sync.service.js';
import { GSC_SYNC_QUEUE, type GscInitialSyncJob } from './gsc.types.js';

@Injectable()
@Processor(GSC_SYNC_QUEUE)
export class GscSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GscSyncProcessor.name);

  constructor(private readonly syncService: GscSyncService) {
    super();
  }

  async process(job: Job<GscInitialSyncJob>): Promise<void> {
    if (job.name !== 'gsc_initial_sync') {
      this.logger.warn(`Ignoring unsupported GSC sync job: ${job.name}`);
      return;
    }
    await this.syncService.run(job.data.syncJobId);
  }
}
