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
      useFactory: (config: ConfigService) =>
        postgres(
          config.get<string>(
            "DATABASE_URL",
            "postgresql://postgres:postgres@localhost:5432/hub"
          )
        )
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
