CREATE TABLE IF NOT EXISTS search_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_account_id uuid NOT NULL REFERENCES integration_accounts(id) ON DELETE CASCADE,
  dimension text NOT NULL,
  dimension_value text NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  ctr_millipct integer NOT NULL DEFAULT 0,
  position_tenths integer NOT NULL DEFAULT 0,
  period_days integer NOT NULL DEFAULT 90,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS search_performance_unique
  ON search_performance (integration_account_id, dimension, dimension_value, period_days);

CREATE INDEX IF NOT EXISTS idx_search_performance_workspace
  ON search_performance (workspace_id, dimension, period_days);
