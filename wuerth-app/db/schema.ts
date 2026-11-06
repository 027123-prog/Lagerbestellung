import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Only schema belongs in migrations. The user's catalogue is runtime data.
export const products = sqliteTable("products", {
  id: text("id").notNull(),
  ownerId: text("owner_id").notNull(),
  articleNumber: text("article_number").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  stockUnit: text("stock_unit").notNull(),
  orderMode: text("order_mode", { enum: ["stock", "empty", "manual"] }).notNull(),
  contentsPerSalesUnit: integer("contents_per_sales_unit").notNull(),
  purchaseMultipleSalesUnits: integer("purchase_multiple_sales_units").notNull(),
  netPricePerSalesUnitCents: integer("net_price_per_sales_unit_cents"),
  priceAsOf: text("price_as_of"),
  targetWorkshop: integer("target_workshop"),
  targetReserve: integer("target_reserve"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.ownerId, table.id] }),
  index("products_owner_sort").on(table.ownerId, table.sortOrder),
]);

export const entries = sqliteTable("entries", {
  ownerId: text("owner_id").notNull(),
  productId: text("product_id").notNull(),
  data: text("data").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.ownerId, table.productId] })]);

export const settings = sqliteTable("settings", {
  ownerId: text("owner_id").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.ownerId, table.key] })]);
