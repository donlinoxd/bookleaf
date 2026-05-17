ALTER TABLE `books` RENAME TO `resources`;
--> statement-breakpoint
ALTER TABLE `book_copies` RENAME TO `resource_copies`;
--> statement-breakpoint
ALTER TABLE `resource_copies` RENAME COLUMN `book_id` TO `resource_id`;
--> statement-breakpoint
ALTER TABLE `reservations` RENAME COLUMN `book_id` TO `resource_id`;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `material_type` text NOT NULL DEFAULT 'BOOK';
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `subtitle` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `edition` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `volume` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `issue_number` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `series_title` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `doi` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `url` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `duration` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `language` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `call_number` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `call_number_type` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `content_type` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `media_type` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `carrier_type` text;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `is_loanable` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `resources` ADD COLUMN `loan_period_days` integer;
