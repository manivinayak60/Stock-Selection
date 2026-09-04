CREATE TABLE `paper_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`symbol` text NOT NULL,
	`setup` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`entry` real NOT NULL,
	`stop` real NOT NULL,
	`target` real NOT NULL,
	`quantity` integer NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`exit_price` real,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scan_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`market_date` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`universe_count` integer NOT NULL,
	`qualified_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`capital` real DEFAULT 50000 NOT NULL,
	`normal_risk` real DEFAULT 5000 NOT NULL,
	`hard_risk` real DEFAULT 8000 NOT NULL,
	`per_stock_risk` real DEFAULT 2000 NOT NULL,
	`max_positions` integer DEFAULT 5 NOT NULL,
	`max_sector_allocation` real DEFAULT 35 NOT NULL,
	`provider` text DEFAULT 'FREE_EOD' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`symbol` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_watchlist_user_symbol` ON `watchlist` (`user_id`,`symbol`);