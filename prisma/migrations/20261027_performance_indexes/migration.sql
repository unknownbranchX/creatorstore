-- Performance Indexes Migration
-- Safe, non-destructive composite indexes for high-frequency queries

-- 1. Customers: Sorting & pagination by creator
CREATE INDEX IF NOT EXISTS "idx_customers_creator_created_at" 
ON "customers" ("creator_id", "created_at" DESC);

-- 2. Store Sections: Ordered retrieval by position
CREATE INDEX IF NOT EXISTS "idx_store_sections_creator_position" 
ON "store_sections" ("creator_id", "position" ASC);

-- 3. Products: Filter by status & sort by creation time
CREATE INDEX IF NOT EXISTS "idx_products_creator_status_created" 
ON "products" ("creator_id", "status", "created_at" DESC);

-- 4. Orders: Pagination by creator & product group aggregation
CREATE INDEX IF NOT EXISTS "idx_orders_creator_created_at" 
ON "orders" ("creator_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_orders_creator_product_status" 
ON "orders" ("creator_id", "product_id", "status");
