import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { verifyWebhookHmac } from './crypto.util.js';
import {
  SHOPIFY_WEBHOOK_QUEUE,
  normalizeShopifyTopic,
  type WebhookJobData,
} from './shopify-webhook.types.js';

@Controller('shopify')
export class ShopifyWebhookController {
  private readonly logger = new Logger(ShopifyWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(SHOPIFY_WEBHOOK_QUEUE) private readonly webhookQueue: Queue<WebhookJobData>,
  ) {}

  /**
   * POST /api/shopify/webhooks
   *
   * Shopify delivers signed webhook events here.
   * Security-critical path — HMAC must be verified against the raw request body
   * BEFORE any business logic. Returns 200 immediately after verification;
   * processing is fully async via BullMQ.
   */
  @Post('webhooks')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-shopify-hmac-sha256') hmacHeader: string,
    @Headers('x-shopify-topic') topicHeader: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
    @Headers('x-shopify-webhook-id') webhookId: string,
  ): Promise<{ received: boolean }> {
    // 1. Verify HMAC against raw body — must happen before any body parsing
    const rawBody = req.rawBody;
    if (!rawBody) {
      // rawBody is only available when NestFactory is created with { rawBody: true }
      throw new BadRequestException('Raw body unavailable — check NestFactory config');
    }

    const secret = this.config.getOrThrow<string>('SHOPIFY_API_SECRET');
    if (!verifyWebhookHmac(rawBody, hmacHeader, secret)) {
      // Log at warn level — could be a probe or misconfiguration, not necessarily an attack
      this.logger.warn(`Webhook HMAC verification failed shop=${shopDomain} topic=${topicHeader}`);
      throw new UnauthorizedException('Invalid webhook HMAC');
    }

    // 2. Normalize topic — unknown topics are silently acknowledged (Shopify expects 200)
    const topic = normalizeShopifyTopic(topicHeader ?? '');
    if (!topic) {
      this.logger.debug(`Unhandled webhook topic=${topicHeader} — acknowledged and ignored`);
      return { received: true };
    }

    if (!shopDomain || !webhookId) {
      throw new BadRequestException('Missing required Shopify webhook headers');
    }

    // 3. Parse body — safe to do after HMAC verification
    const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;

    // 4. Enqueue for async processing — use webhookId as job ID for idempotency
    //    If Shopify retries delivery, BullMQ will deduplicate by job ID.
    await this.webhookQueue.add(
      'process-webhook',
      { topic, shopDomain, webhookId, payload },
      {
        jobId: webhookId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    );

    this.logger.debug(`Webhook enqueued topic=${topic} shop=${shopDomain} id=${webhookId}`);
    return { received: true };
  }
}
