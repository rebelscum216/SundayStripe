CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  entity_id TEXT,
  context_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  output_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_recommendations_workspace_source_entity
  ON ai_recommendations(workspace_id, source_type, entity_id);

CREATE INDEX IF NOT EXISTS ai_recommendations_context_hash
  ON ai_recommendations(context_hash);
