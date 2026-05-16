CREATE TABLE `book_copies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`copy_number` integer NOT NULL,
	`condition` text DEFAULT 'good' NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`isbn` text,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`publisher` text,
	`year` integer,
	`genre` text,
	`description` text,
	`cover_uri` text,
	`total_copies` integer DEFAULT 1 NOT NULL,
	`available_copies` integer DEFAULT 1 NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `borrowing_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`copy_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`borrowed_at` text DEFAULT (datetime('now')) NOT NULL,
	`due_date` text NOT NULL,
	`returned_at` text,
	`fine_amount` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`copy_id`) REFERENCES `book_copies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`borrowing_id` integer NOT NULL,
	`amount` real NOT NULL,
	`paid` integer DEFAULT false NOT NULL,
	`paid_at` text,
	FOREIGN KEY (`borrowing_id`) REFERENCES `borrowing_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`logo_uri` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`reserved_at` text DEFAULT (datetime('now')) NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`name` text NOT NULL,
	`id_number` text NOT NULL,
	`role` text NOT NULL,
	`pin_hash` text NOT NULL,
	`photo_uri` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_id_number_unique` ON `users` (`id_number`);