CREATE TABLE `import_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`imported_by_user_id` integer NOT NULL,
	`filename` text NOT NULL,
	`duplicate_strategy` text NOT NULL,
	`row_count` integer NOT NULL,
	`created_count` integer NOT NULL,
	`copies_added_count` integer NOT NULL,
	`skipped_count` integer NOT NULL,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`imported_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
