import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hub";

const migrations = [
  "drizzle/0000_initial.sql",
  "drizzle/0001_search_performance.sql",
  "drizzle/0002_orders.sql",
  "drizzle/0003_seo_metafields.sql",
  "drizzle/0004_listing_quality_score.sql",
  "drizzle/0005_ai_recommendations.sql",
  "drizzle/0006_gtin_exempt.sql",
];
const rootDir = dirname(fileURLToPath(import.meta.url));
const sql = postgres(databaseUrl, { max: 1 });

try {
  await sql`CREATE TABLE IF NOT EXISTS drizzle_migrations (
    id serial PRIMARY KEY,
    migration_name text NOT NULL UNIQUE,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  for (const migration of migrations) {
    const [existing] = await sql<{ id: number }[]>`
      SELECT id FROM drizzle_migrations WHERE migration_name = ${migration}
    `;

    if (existing) {
      console.log(`Skipping ${migration}`);
      continue;
    }

    const contents = await readFile(join(rootDir, migration), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`
        INSERT INTO drizzle_migrations (migration_name)
        VALUES (${migration})
      `;
    });

    console.log(`Applied ${migration}`);
  }
} finally {
  await sql.end();
}
