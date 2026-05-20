CREATE TABLE `institutions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `address` text DEFAULT '' NOT NULL,
  `logo_uri` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `institution_id` integer NOT NULL REFERENCES `institutions`(`id`),
  `name` text NOT NULL,
  `id_number` text NOT NULL,
  `role` text NOT NULL,
  `pin_hash` text NOT NULL,
  `photo_uri` text,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `department` text,
  `user_type` text
);
--> statement-breakpoint
CREATE TABLE `authority_names` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `institution_id` integer NOT NULL REFERENCES `institutions`(`id`),
  `name` text NOT NULL,
  `name_type` text DEFAULT 'personal' NOT NULL,
  `variants` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resources` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `institution_id` integer NOT NULL REFERENCES `institutions`(`id`),
  `material_type` text DEFAULT 'BOOK' NOT NULL,
  `isbn` text,
  `issn` text,
  `title` text NOT NULL,
  `author` text NOT NULL,
  `publisher` text,
  `year` integer,
  `genre` text,
  `description` text,
  `cover_uri` text,
  `subtitle` text,
  `edition` text,
  `volume` text,
  `issue_number` text,
  `series_title` text,
  `doi` text,
  `url` text,
  `duration` text,
  `language` text,
  `call_number` text,
  `call_number_type` text,
  `content_type` text,
  `media_type` text,
  `carrier_type` text,
  `subject_headings` text,
  `author_authority_id` integer REFERENCES `authority_names`(`id`),
  `is_loanable` integer DEFAULT 1 NOT NULL,
  `loan_period_days` integer,
  `total_copies` integer DEFAULT 1 NOT NULL,
  `available_copies` integer DEFAULT 1 NOT NULL,
  `added_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resource_copies` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `resource_id` integer NOT NULL REFERENCES `resources`(`id`),
  `copy_number` integer NOT NULL,
  `condition` text DEFAULT 'good' NOT NULL,
  `status` text DEFAULT 'available' NOT NULL,
  `barcode` text,
  `shelf_location` text,
  `accession_number` text
);
--> statement-breakpoint
CREATE TABLE `borrowing_records` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `copy_id` integer NOT NULL REFERENCES `resource_copies`(`id`),
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `borrowed_at` text DEFAULT (datetime('now')) NOT NULL,
  `due_date` text NOT NULL,
  `returned_at` text,
  `fine_amount` real DEFAULT 0 NOT NULL,
  `renewal_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `resource_id` integer NOT NULL REFERENCES `resources`(`id`),
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `reserved_at` text DEFAULT (datetime('now')) NOT NULL,
  `status` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fines` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `borrowing_id` integer NOT NULL REFERENCES `borrowing_records`(`id`),
  `amount` real NOT NULL,
  `paid` integer DEFAULT 0 NOT NULL,
  `paid_at` text
);
--> statement-breakpoint
CREATE TABLE `scan_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `institution_id` integer NOT NULL REFERENCES `institutions`(`id`),
  `started_at` text DEFAULT (datetime('now')) NOT NULL,
  `ended_at` text,
  `status` text DEFAULT 'in_progress' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scan_entries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `session_id` integer NOT NULL REFERENCES `scan_sessions`(`id`),
  `isbn` text NOT NULL,
  `resource_id` integer REFERENCES `resources`(`id`),
  `scanned_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gate_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `institution_id` integer NOT NULL REFERENCES `institutions`(`id`),
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `direction` text NOT NULL,
  `method` text NOT NULL,
  `logged_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `favorites` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `resource_id` integer NOT NULL REFERENCES `resources`(`id`),
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `resource_id` integer NOT NULL REFERENCES `resources`(`id`),
  `rating` integer NOT NULL,
  `comment` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_id_number_unique` ON `users` (`id_number`);
--> statement-breakpoint
CREATE INDEX `resources_institution_id_idx` ON `resources` (`institution_id`);
--> statement-breakpoint
CREATE INDEX `users_institution_id_idx` ON `users` (`institution_id`);
--> statement-breakpoint
CREATE INDEX `resource_copies_resource_id_idx` ON `resource_copies` (`resource_id`);
--> statement-breakpoint
CREATE INDEX `resource_copies_status_idx` ON `resource_copies` (`status`);
--> statement-breakpoint
CREATE INDEX `borrowing_records_user_id_idx` ON `borrowing_records` (`user_id`);
--> statement-breakpoint
CREATE INDEX `borrowing_records_copy_id_idx` ON `borrowing_records` (`copy_id`);
--> statement-breakpoint
CREATE INDEX `borrowing_records_returned_at_idx` ON `borrowing_records` (`returned_at`);
--> statement-breakpoint
CREATE INDEX `reservations_resource_id_idx` ON `reservations` (`resource_id`);
--> statement-breakpoint
CREATE INDEX `reservations_user_id_idx` ON `reservations` (`user_id`);
--> statement-breakpoint
CREATE INDEX `gate_logs_institution_id_idx` ON `gate_logs` (`institution_id`);
--> statement-breakpoint
CREATE INDEX `gate_logs_user_id_idx` ON `gate_logs` (`user_id`);
--> statement-breakpoint
CREATE INDEX `favorites_user_id_idx` ON `favorites` (`user_id`);
--> statement-breakpoint
CREATE INDEX `reviews_resource_id_idx` ON `reviews` (`resource_id`);
--> statement-breakpoint
CREATE INDEX `scan_entries_session_id_idx` ON `scan_entries` (`session_id`);
--> statement-breakpoint
CREATE INDEX `resources_isbn_idx` ON `resources` (`isbn`);
