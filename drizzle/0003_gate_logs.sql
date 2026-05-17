CREATE TABLE `gate_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL REFERENCES `institutions`(`id`),
	`user_id` integer NOT NULL REFERENCES `users`(`id`),
	`direction` text NOT NULL,
	`method` text NOT NULL,
	`logged_at` text DEFAULT (datetime('now')) NOT NULL
);
