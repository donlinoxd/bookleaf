ALTER TABLE `resources` ADD COLUMN `publisher_authority_id` integer REFERENCES `authority_names`(`id`);
--> statement-breakpoint
ALTER TABLE `authority_names` ADD COLUMN `normalized_name` text;
--> statement-breakpoint
CREATE TABLE `resource_subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource_id` integer NOT NULL,
	`authority_id` integer NOT NULL,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_id`) REFERENCES `authority_names`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_subjects_unique` ON `resource_subjects` (`resource_id`, `authority_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `authority_names_unique` ON `authority_names` (`institution_id`, `name_type`, `normalized_name`);
--> statement-breakpoint
UPDATE `authority_names`
SET `normalized_name` = lower(trim(replace(replace(replace(`name`, char(9), ' '), char(10), ' '), char(13), ' ')))
WHERE `normalized_name` IS NULL;
