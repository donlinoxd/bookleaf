CREATE TABLE `favorites` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `resource_id` integer NOT NULL REFERENCES `resources`(`id`),
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);
