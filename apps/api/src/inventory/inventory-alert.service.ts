import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  alerts,
  inventoryPositions,
  orderLineItems,
  orders,
  products,
  variants,
} from "@sunday-stripe/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@sunday-stripe/db";
import { DRIZZLE_DATABASE } from "../database/database.constants.js";

type Db = PostgresJsDatabase<typeof schema>;

type GeneratedInventoryAlerts = {
  stockRiskCreated: number;
  outOfStockCreated: number;
};

function getVariantTitle(optionValuesJson: unknown, fallbackSku: string): string {
  if (!optionValuesJson || typeof optionValuesJson !== "object") {
    return fallbackSku;
  }

  const selectedOptions = (optionValuesJson as { selectedOptions?: unknown }).selectedOptions;
  if (!Array.isArray(selectedOptions) || selectedOptions.length === 0) {
    return fallbackSku;
  }

  const values = selectedOptions
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const name = (option as { name?: unknown }).name;
      const value = (option as { value?: unknown }).value;
      if (typeof value !== "string" || !value.trim()) return null;
      if (typeof name !== "string" || name.toLowerCase() === "title") return value;
      return `${name}: ${value}`;
    })
    .filter((value): value is string => Boolean(value));

  return values.length > 0 ? values.join(" / ") : fallbackSku;
}

@Injectable()
export class InventoryAlertService {
  private readonly logger = new Logger(InventoryAlertService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: Db) {}

  async generateStockoutAlerts(): Promise<GeneratedInventoryAlerts> {
    const variantRows = await this.db
      .select({
        workspaceId: products.workspaceId,
        productTitle: products.title,
        variantId: variants.id,
        sku: variants.sku,
        optionValuesJson: variants.optionValuesJson,
      })
      .from(variants)
      .innerJoin(products, eq(variants.productId, products.id))
      .orderBy(products.title, variants.sku)
      .limit(1000);

    if (variantRows.length === 0) {
      this.logger.log("Skipping inventory alert generation: no variants found");
      return { stockRiskCreated: 0, outOfStockCreated: 0 };
    }

    const variantIds = variantRows.map((row) => row.variantId);

    const [inventoryRows, revenueRows, existingAlertRows] = await Promise.all([
      this.db
        .select({
          variantId: inventoryPositions.variantId,
          locationKey: inventoryPositions.locationKey,
          quantityName: inventoryPositions.quantityName,
          quantityValue: inventoryPositions.quantityValue,
        })
        .from(inventoryPositions)
        .where(inArray(inventoryPositions.variantId, variantIds))
        .orderBy(inventoryPositions.locationKey, inventoryPositions.quantityName),
      this.db
        .select({
          variantId: orderLineItems.variantId,
          unitsSold: sql<number>`coalesce(sum(${orderLineItems.quantity}), 0)::int`,
          revenueCents: sql<number>`coalesce(sum(${orderLineItems.quantity} * ${orderLineItems.unitPriceCents}), 0)::int`,
        })
        .from(orderLineItems)
        .innerJoin(orders, eq(orderLineItems.orderId, orders.id))
        .where(
          and(
            sql`${orders.createdAt} > now() - interval '90 days'`,
            sql`${orderLineItems.variantId} is not null`,
            sql`coalesce(${orders.financialStatus}, 'paid') not in ('refunded', 'voided')`,
          ),
        )
        .groupBy(orderLineItems.variantId),
      this.db
        .select({
          entityRef: alerts.entityRef,
        })
        .from(alerts)
        .where(
          and(
            eq(alerts.status, "open"),
            eq(alerts.sourcePlatform, "shopify"),
            inArray(alerts.entityRef, variantIds),
          ),
        ),
    ]);

    const revenueByVariant = new Map(
      revenueRows
        .filter((row): row is typeof row & { variantId: string } => Boolean(row.variantId))
        .map((row) => [row.variantId, row]),
    );

    const quantityByVariant = new Map<string, Map<string, Map<string, number>>>();
    for (const row of inventoryRows) {
      if (!quantityByVariant.has(row.variantId)) {
        quantityByVariant.set(row.variantId, new Map());
      }
      const byLocation = quantityByVariant.get(row.variantId)!;
      if (!byLocation.has(row.locationKey)) {
        byLocation.set(row.locationKey, new Map());
      }
      byLocation.get(row.locationKey)!.set(row.quantityName, row.quantityValue);
    }

    const existingOpenVariantIds = new Set(
      existingAlertRows
        .map((row) => row.entityRef)
        .filter((entityRef): entityRef is string => Boolean(entityRef)),
    );

    const alertValues: Array<typeof alerts.$inferInsert> = [];
    let stockRiskCreated = 0;
    let outOfStockCreated = 0;

    for (const row of variantRows) {
      const locationMap = quantityByVariant.get(row.variantId) ?? new Map();
      const available = Array.from(locationMap.values()).reduce(
        (sum, quantities) => sum + (quantities.get("available") ?? 0),
        0,
      );

      const revenue = revenueByVariant.get(row.variantId);
      const unitsSold = revenue?.unitsSold ?? 0;
      const revenueCents = revenue?.revenueCents ?? 0;
      const dailyVelocity = unitsSold > 0 ? unitsSold / 90 : 0;
      const daysOfCover = dailyVelocity > 0
        ? Math.round((available / dailyVelocity) * 10) / 10
        : null;
      const variantTitle = getVariantTitle(row.optionValuesJson, row.sku);
      const title = row.productTitle && variantTitle !== row.sku
        ? `${row.productTitle} / ${variantTitle}`
        : (row.productTitle ?? variantTitle);

      const payloadJson = {
        sku: row.sku,
        title,
        daysOfCover,
        available,
        unitsSold,
      };

      if (existingOpenVariantIds.has(row.variantId)) {
        continue;
      }

      if (available === 0 && unitsSold > 0) {
        alertValues.push({
          workspaceId: row.workspaceId,
          severity: "high",
          category: "out_of_stock",
          entityRef: row.variantId,
          sourcePlatform: "shopify",
          payloadJson,
          status: "open",
        });
        existingOpenVariantIds.add(row.variantId);
        outOfStockCreated += 1;
        continue;
      }

      if (daysOfCover !== null && daysOfCover < 14 && revenueCents > 0) {
        alertValues.push({
          workspaceId: row.workspaceId,
          severity: "high",
          category: "stock_risk",
          entityRef: row.variantId,
          sourcePlatform: "shopify",
          payloadJson,
          status: "open",
        });
        existingOpenVariantIds.add(row.variantId);
        stockRiskCreated += 1;
      }
    }

    if (alertValues.length > 0) {
      await this.db.insert(alerts).values(alertValues);
    }

    this.logger.log(
      `Generated inventory alerts stockRisk=${stockRiskCreated} outOfStock=${outOfStockCreated}`,
    );

    return { stockRiskCreated, outOfStockCreated };
  }
}
