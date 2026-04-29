import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module.js';

import { ShopifyOAuthController } from './shopify-oauth.controller.js';
import { ShopifyOAuthService } from './shopify-oauth.service.js';

import { ShopifyWebhookController } from './shopify-webhook.controller.js';
import { ShopifyWebhookProcessor } from './shopify-webhook.processor.js';
import { SHOPIFY_WEBHOOK_QUEUE } from './shopify-webhook.types.js';

// Task 4 — added by Codex, files landing in sync/
import { ShopifyInitialSyncProcessor } from './sync/shopify-initial-sync.processor.js';
import { ShopifyInitialSyncService } from './sync/shopify-initial-sync.service.js';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({ name: 'shopify-sync' }),
    BullModule.registerQueue({ name: SHOPIFY_WEBHOOK_QUEUE }),
  ],
  controllers: [
    ShopifyOAuthController,
    ShopifyWebhookController,
  ],
  providers: [
    ShopifyOAuthService,
    ShopifyInitialSyncService,
    ShopifyInitialSyncProcessor,
    ShopifyWebhookProcessor,
  ],
  exports: [ShopifyOAuthService, ShopifyInitialSyncService],
})
export class ShopifyModule {}
