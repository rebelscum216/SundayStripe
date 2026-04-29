import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { MerchantApiService } from './merchant-api.service.js';
import { MerchantSyncProcessor } from './merchant-sync.processor.js';
import { MerchantSyncService } from './merchant-sync.service.js';
import { MERCHANT_SYNC_QUEUE } from './merchant.types.js';

@Module({
  imports: [DatabaseModule, BullModule.registerQueue({ name: MERCHANT_SYNC_QUEUE })],
  providers: [MerchantApiService, MerchantSyncService, MerchantSyncProcessor],
  exports: [MerchantApiService, MerchantSyncService],
})
export class MerchantModule {}
