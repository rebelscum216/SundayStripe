import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { GscApiService } from './gsc-api.service.js';
import { GscSchedulerService } from './gsc-scheduler.service.js';
import { GscSyncProcessor } from './gsc-sync.processor.js';
import { GscSyncService } from './gsc-sync.service.js';
import { GSC_SYNC_QUEUE } from './gsc.types.js';

@Module({
  imports: [DatabaseModule, BullModule.registerQueue({ name: GSC_SYNC_QUEUE })],
  providers: [GscApiService, GscSyncService, GscSyncProcessor, GscSchedulerService],
  exports: [GscSyncService, GscSchedulerService],
})
export class GscModule {}
