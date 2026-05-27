import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { AmazonModule } from "./amazon/amazon.module.js";
import { AppController } from "./app.controller.js";
import { DatabaseModule } from "./database/database.module.js";
import { GscModule } from "./gsc/gsc.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { MerchantModule } from "./merchant/merchant.module.js";
import { ShopifyModule } from "./shopify/shopify.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"]
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
        const tls = redisUrl.startsWith("rediss://") ? {
          rejectUnauthorized: false,
          servername: new URL(redisUrl.replace(/^rediss:\/\/[^@]+@/, "https://")).hostname,
        } : undefined;
        return {
          connection: {
            url: redisUrl,
            tls,
            enableOfflineQueue: false,
            maxRetriesPerRequest: null,
            connectTimeout: 5000,
            retryStrategy: () => null,
          }
        };
      }
    }),
    ScheduleModule.forRoot(),
    BullModule.registerQueue(
      { name: "shopify-sync" },
      { name: "shopify-orders-sync" },
      { name: "merchant-sync" },
      { name: "gsc-sync" },
      { name: "amazon-sync" },
    ),
    DatabaseModule,
    AmazonModule,
    GscModule,
    InventoryModule,
    MerchantModule,
    ShopifyModule,
  ],
  controllers: [AppController]
})
export class AppModule {}
