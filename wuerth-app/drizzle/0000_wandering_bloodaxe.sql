CREATE TABLE `entries` (
	`owner_id` text NOT NULL,
	`product_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `product_id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`article_number` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`stock_unit` text NOT NULL,
	`order_mode` text NOT NULL,
	`contents_per_sales_unit` integer NOT NULL,
	`purchase_multiple_sales_units` integer NOT NULL,
	`net_price_per_sales_unit_cents` integer,
	`price_as_of` text,
	`target_workshop` integer,
	`target_reserve` integer,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `products_owner_sort` ON `products` (`owner_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `settings` (
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `key`)
);
