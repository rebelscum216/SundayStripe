CREATE TABLE IF NOT EXISTS "gsc_daily_summary" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "integration_account_id" uuid NOT NULL REFERENCES "integration_accounts"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "clicks" integer NOT NULL DEFAULT 0,
  "impressions" integer NOT NULL DEFAULT 0,
  "fetched_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "gsc_daily_unique" UNIQUE ("integration_account_id", "date")
);
CREATE INDEX IF NOT EXISTS "gsc_daily_date_idx" ON "gsc_daily_summary" ("integration_account_id", "date" DESC);
