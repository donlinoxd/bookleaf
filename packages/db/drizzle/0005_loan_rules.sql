CREATE TABLE `loan_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`user_type` text NOT NULL,
	`material_type` text NOT NULL,
	`loan_period_days` integer NOT NULL,
	`type_limit` integer,
	`max_renewals` integer NOT NULL,
	`renewal_period_days` integer,
	`fine_per_day` real NOT NULL,
	`grace_period_days` integer DEFAULT 0 NOT NULL,
	`fine_max` real,
	`is_loanable` integer DEFAULT 1 NOT NULL,
	`is_holdable` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_rules_scope_unique` ON `loan_rules` (`institution_id`,`user_type`,`material_type`);
--> statement-breakpoint
CREATE TABLE `category_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`user_type` text NOT NULL,
	`overall_limit` integer,
	`fines_block_threshold` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_limits_scope_unique` ON `category_limits` (`institution_id`,`user_type`);
--> statement-breakpoint
CREATE TABLE `circ_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`acted_by_user_id` integer NOT NULL,
	`patron_user_id` integer NOT NULL,
	`copy_id` integer,
	`reason_code` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patron_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`copy_id`) REFERENCES `resource_copies`(`id`) ON UPDATE no action ON DELETE no action
);
