ALTER TABLE search_performance
  ADD COLUMN IF NOT EXISTS is_branded boolean NOT NULL DEFAULT false;
