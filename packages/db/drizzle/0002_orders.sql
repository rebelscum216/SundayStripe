CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_account_id uuid NOT NULL REFERENCES integration_accounts(id) ON DELETE CASCADE,
  shopify_order_id text NOT NULL,
  created_at timestamptz NOT NULL,
  financial_status text,
  total_price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD'
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_shopify_order_unique
  ON orders (integration_account_id, shopify_order_id);

CREATE TABLE IF NOT EXISTS order_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shopify_line_item_id text NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES variants(id) ON DELETE SET NULL,
  shopify_product_id text,
  shopify_variant_id text,
  sku text,
  title text,
  quantity integer NOT NULL DEFAULT 0,
  unit_price_cents integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS order_line_items_shopify_line_item_unique
  ON order_line_items (order_id, shopify_line_item_id);
