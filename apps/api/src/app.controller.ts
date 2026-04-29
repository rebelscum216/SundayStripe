import { Controller, Get, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { alerts, integrationAccounts, products, syncJobs, variants } from "@sunday-stripe/db";
import { and, count, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { Redis } from "ioredis";
import type { Sql } from "postgres";
import type * as schema from "@sunday-stripe/db";
import { DATABASE_CONNECTION, DRIZZLE_DATABASE } from "./database/database.constants.js";

type Db = PostgresJsDatabase<typeof schema>;

@Controller()
export class AppController {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    private readonly config: ConfigService
  ) {}

  @Get("status")
  async status() {
    const postgresReachable = await this.isPostgresReachable();
    const redisReachable = await this.isRedisReachable();

    if (!postgresReachable || !redisReachable) {
      return {
        ok: false,
        integrations: []
      };
    }

    const integrations = await this.db.select().from(integrationAccounts);
    const integrationStatuses = await Promise.all(
      integrations.map(async (integration) => {
        const [
          [{ value: productCount }],
          [{ value: variantCount }],
          [{ value: pendingJobs }],
          [{ value: failedJobs }],
          [{ value: openAlerts }]
        ] = await Promise.all([
          this.db
            .select({ value: count() })
            .from(products)
            .where(eq(products.workspaceId, integration.workspaceId)),
          this.db
            .select({ value: count() })
            .from(variants)
            .innerJoin(products, eq(variants.productId, products.id))
            .where(eq(products.workspaceId, integration.workspaceId)),
          this.db
            .select({ value: count() })
            .from(syncJobs)
            .where(
              and(
                eq(syncJobs.integrationAccountId, integration.id),
                eq(syncJobs.state, "pending")
              )
            ),
          this.db
            .select({ value: count() })
            .from(syncJobs)
            .where(
              and(
                eq(syncJobs.integrationAccountId, integration.id),
                eq(syncJobs.state, "failed")
              )
            ),
          this.db
            .select({ value: count() })
            .from(alerts)
            .where(and(eq(alerts.workspaceId, integration.workspaceId), eq(alerts.status, "open")))
        ]);

        return {
          platform: integration.platform,
          shop_domain: integration.shopDomain,
          status: integration.status,
          last_synced_at: integration.lastSyncedAt?.toISOString() ?? null,
          product_count: productCount,
          variant_count: variantCount,
          pending_jobs: pendingJobs,
          failed_jobs: failedJobs,
          open_alerts: openAlerts
        };
      })
    );

    return {
      ok: true,
      integrations: integrationStatuses
    };
  }

  private async isPostgresReachable(): Promise<boolean> {
    try {
      const [dbResult] = await this.sql<{ ok: number }[]>`SELECT 1 AS ok`;
      return dbResult?.ok === 1;
    } catch {
      return false;
    }
  }

  private async isRedisReachable(): Promise<boolean> {
    const redis = new Redis(this.config.get<string>("REDIS_URL", "redis://localhost:6379"), {
      maxRetriesPerRequest: 1
    });

    try {
      const redisResult = await redis.ping();
      return redisResult === "PONG";
    } catch {
      return false;
    } finally {
      redis.disconnect();
    }
  }
}
