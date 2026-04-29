import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AppController } from "./app.controller.js";
import { DatabaseModule } from "./database/database.module.js";
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
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>("REDIS_URL", "redis://localhost:6379")
        }
      })
    }),
    DatabaseModule,
    MerchantModule,
    ShopifyModule,
  ],
  controllers: [AppController]
})
export class AppModule {}
