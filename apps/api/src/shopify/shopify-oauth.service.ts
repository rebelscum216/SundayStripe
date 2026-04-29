import { Injectable, Logger, UnauthorizedException, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { encryptToken, generateStateNonce, verifyOAuthHmac } from './crypto.util.js';
import { DRIZZLE_DATABASE } from '../database/database.constants.js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@sunday-stripe/db';
import { workspaces, integrationAccounts, syncJobs } from '@sunday-stripe/db';
import { eq, and } from 'drizzle-orm';

type Db = PostgresJsDatabase<typeof schema>;

// In-memory nonce store with 10-minute TTL.
// TODO: replace with Redis SET nx ex before multi-instance deployment.
const NONCE_TTL_MS = 10 * 60 * 1000;
const pendingNonces = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiresAt] of pendingNonces) {
    if (now > expiresAt) pendingNonces.delete(nonce);
  }
}, 60_000);

@Injectable()
export class ShopifyOAuthService {
  private readonly logger = new Logger(ShopifyOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    @InjectQueue('shopify-sync') private readonly shopifySyncQueue: Queue,
  ) {}

  /**
   * Builds the Shopify OAuth authorization URL and registers a CSRF nonce.
   */
  buildAuthUrl(shop: string): string {
    this.validateShopDomain(shop);

    const nonce = generateStateNonce();
    pendingNonces.set(nonce, Date.now() + NONCE_TTL_MS);

    const params = new URLSearchParams({
      client_id: this.config.getOrThrow('SHOPIFY_API_KEY'),
      scope: this.config.getOrThrow('SHOPIFY_SCOPES'),
      redirect_uri: `${this.config.getOrThrow('SHOPIFY_APP_URL')}/api/shopify/callback`,
      state: nonce,
    });

    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  /**
   * Handles the OAuth callback:
   *  1. Verifies HMAC
   *  2. Verifies and consumes the state nonce
   *  3. Exchanges the code for an offline access token
   *  4. Upserts workspace + integration_account
   */
  async handleCallback(query: Record<string, string>): Promise<{ workspaceId: string; syncJobId: string }> {
    const { code, shop, state } = query;

    if (!code || !shop || !state) {
      throw new BadRequestException('Missing required OAuth callback parameters');
    }

    this.validateShopDomain(shop);

    // 1. Verify HMAC
    const secret = this.config.getOrThrow<string>('SHOPIFY_API_SECRET');
    if (!verifyOAuthHmac(query, secret)) {
      throw new UnauthorizedException('Invalid OAuth HMAC');
    }

    // 2. Verify and consume state nonce
    const expiresAt = pendingNonces.get(state);
    if (!expiresAt || Date.now() > expiresAt) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
    pendingNonces.delete(state);

    // 3. Exchange code for access token
    const accessToken = await this.exchangeCodeForToken(shop, code);

    // 4. Upsert workspace + integration account
    const { workspaceId, integrationAccountId } = await this.upsertIntegration(shop, accessToken);

    // 5. Register webhooks — non-fatal if already registered
    await this.registerWebhooks(shop, accessToken);

    const syncJobId = await this.enqueueInitialSync(integrationAccountId);

    this.logger.log(`Shopify OAuth complete for shop=${shop} workspace=${workspaceId}`);
    return { workspaceId, syncJobId };
  }

  private async exchangeCodeForToken(shop: string, code: string): Promise<string> {
    const url = `https://${shop}/admin/oauth/access_token`;
    const body = {
      client_id: this.config.getOrThrow('SHOPIFY_API_KEY'),
      client_secret: this.config.getOrThrow('SHOPIFY_API_SECRET'),
      code,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Token exchange failed: ${res.status} ${text}`);
      throw new BadRequestException('Shopify token exchange failed');
    }

    const data = await res.json() as { access_token?: string };
    if (!data.access_token) {
      throw new BadRequestException('No access_token in Shopify response');
    }

    return data.access_token;
  }

  private async upsertIntegration(
    shop: string,
    accessToken: string,
  ): Promise<{ workspaceId: string; integrationAccountId: string }> {
    const encrypted = encryptToken(accessToken);
    const scopesJson = { scopes: this.config.get('SHOPIFY_SCOPES') };

    // Find or create workspace — Phase 1: one workspace per shop domain
    const existingWorkspaces = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.name, shop))
      .limit(1);

    let workspaceId: string;
    if (existingWorkspaces.length > 0) {
      workspaceId = existingWorkspaces[0].id;
    } else {
      const [created] = await this.db
        .insert(workspaces)
        .values({ name: shop })
        .returning({ id: workspaces.id });
      workspaceId = created.id;
    }

    // Upsert integration account
    const existing = await this.db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.platform, 'shopify'),
          eq(integrationAccounts.shopDomain, shop),
        ),
      )
      .limit(1);

    let integrationAccountId: string;

    if (existing.length > 0) {
      await this.db
        .update(integrationAccounts)
        .set({ encryptedAccessToken: encrypted, status: 'active', tokenExpiresAt: null, scopesJson })
        .where(eq(integrationAccounts.id, existing[0].id));
      integrationAccountId = existing[0].id;
    } else {
      const [created] = await this.db.insert(integrationAccounts).values({
        workspaceId,
        platform: 'shopify',
        shopDomain: shop,
        externalAccountId: shop,
        encryptedAccessToken: encrypted,
        status: 'active',
        scopesJson,
      }).returning({ id: integrationAccounts.id });
      integrationAccountId = created.id;
    }

    return { workspaceId, integrationAccountId };
  }

  private async enqueueInitialSync(integrationAccountId: string): Promise<string> {
    const [created] = await this.db
      .insert(syncJobs)
      .values({
        integrationAccountId,
        jobType: 'shopify_initial_sync',
        state: 'pending',
      })
      .returning({ id: syncJobs.id });

    await this.shopifySyncQueue.add(
      'shopify_initial_sync',
      { syncJobId: created.id },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 30_000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    return created.id;
  }

  private async registerWebhooks(shop: string, accessToken: string): Promise<void> {
    const appUrl = this.config.getOrThrow<string>('SHOPIFY_APP_URL');
    const apiVersion = this.config.get<string>('SHOPIFY_API_VERSION', '2025-10');
    const callbackUrl =
      this.config.get<string>('SHOPIFY_WEBHOOK_CALLBACK_URL') ??
      `${appUrl}/api/shopify/webhooks`;

    const topics = ['PRODUCTS_UPDATE', 'PRODUCTS_DELETE', 'INVENTORY_LEVELS_UPDATE'] as const;

    const mutation = `
      mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }) {
          webhookSubscription { id topic callbackUrl }
          userErrors { field message }
        }
      }
    `;

    const existingWebhooks = await this.listWebhooks(shop, accessToken);

    await Promise.all(
      topics.map(async (topic) => {
        try {
          const alreadyRegistered = existingWebhooks.some(
            (webhook) => webhook.topic === topic && webhook.callbackUrl === callbackUrl,
          );

          if (alreadyRegistered) {
            this.logger.debug(`Webhook already registered: ${topic} → ${callbackUrl}`);
            return;
          }

          const res = await fetch(
            `https://${shop}/admin/api/${apiVersion}/graphql.json`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
              },
              body: JSON.stringify({ query: mutation, variables: { topic, callbackUrl } }),
            },
          );

          const data = await res.json() as {
            errors?: { message: string }[] | string;
            data?: { webhookSubscriptionCreate?: { userErrors?: { message: string }[] } };
          };

          if (!res.ok || data.errors) {
            const message = Array.isArray(data.errors)
              ? data.errors.map((error) => error.message).join(', ')
              : data.errors || res.statusText;
            throw new Error(`Shopify GraphQL error (${res.status}): ${message}`);
          }

          const errors = data.data?.webhookSubscriptionCreate?.userErrors ?? [];
          if (errors.length > 0) {
            this.logger.debug(`Webhook ${topic} registration note: ${errors.map(e => e.message).join(', ')}`);
          } else {
            this.logger.log(`Webhook registered: ${topic} → ${callbackUrl}`);
          }
        } catch (err) {
          // Non-fatal — webhooks can be re-registered on next OAuth
          this.logger.error(`Failed to register webhook ${topic} for ${shop}`, err);
        }
      }),
    );
  }

  private async listWebhooks(
    shop: string,
    accessToken: string,
  ): Promise<Array<{ topic: string; callbackUrl: string | null }>> {
    const apiVersion = this.config.get<string>('SHOPIFY_API_VERSION', '2025-10');
    const query = `
      query ExistingWebhooks {
        webhookSubscriptions(first: 100) {
          edges {
            node {
              topic
              endpoint {
                __typename
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
            }
          }
        }
      }
    `;

    try {
      const res = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query }),
      });
      const data = await res.json() as {
        data?: {
          webhookSubscriptions?: {
            edges: Array<{
              node: {
                topic: string;
                endpoint?: {
                  callbackUrl?: string;
                };
              };
            }>;
          };
        };
      };

      return data.data?.webhookSubscriptions?.edges.map((edge) => ({
        topic: edge.node.topic,
        callbackUrl: edge.node.endpoint?.callbackUrl ?? null,
      })) ?? [];
    } catch (error) {
      this.logger.warn(`Could not list existing Shopify webhooks for ${shop}`);
      return [];
    }
  }

  private validateShopDomain(shop: string): void {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
      throw new BadRequestException(`Invalid shop domain: ${shop}`);
    }
  }
}
