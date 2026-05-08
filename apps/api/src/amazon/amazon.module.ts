import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AmazonApiService } from './amazon-api.service.js';
import { AmazonOrdersSyncService } from './amazon-orders-sync.service.js';
import { AmazonSchedulerService } from './amazon-scheduler.service.js';
import { AmazonSyncProcessor } from './amazon-sync.processor.js';
import { AmazonSyncService } from './amazon-sync.service.js';
import { AMAZON_SYNC_QUEUE } from './amazon.types.js';

@Module({
  imports: [DatabaseModule, BullModule.registerQueue({ name: AMAZON_SYNC_QUEUE })],
  providers: [AmazonApiService, AmazonSyncService, AmazonOrdersSyncService, AmazonSyncProcessor, AmazonSchedulerService],
  exports: [AmazonApiService, AmazonSyncService, AmazonOrdersSyncService, AmazonSchedulerService],
})
export class AmazonModule {}
