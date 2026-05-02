ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin_exempt boolean NOT NULL DEFAULT false;
