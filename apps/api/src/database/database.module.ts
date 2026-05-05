import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@sunday-stripe/db/schema";
import { DATABASE_CONNECTION, DRIZZLE_DATABASE } from "./database.constants.js";

@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/hub");
        const dbUrl = new URL(url);
        const ssl = (dbUrl.hostname !== "localhost" && dbUrl.hostname !== "127.0.0.1") ? ("require" as const) : false;
        return postgres(url, { ssl });
      }
    },
    {
      provide: DRIZZLE_DATABASE,
      inject: [DATABASE_CONNECTION],
      useFactory: (client: postgres.Sql) => drizzle(client, { schema })
    }
  ],
  exports: [DATABASE_CONNECTION, DRIZZLE_DATABASE]
})
export class DatabaseModule {}
