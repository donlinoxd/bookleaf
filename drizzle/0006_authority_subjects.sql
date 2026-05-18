CREATE TABLE `authority_names` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `institution_id` integer NOT NULL REFERENCES `institutions`(`id`),
  `name` text NOT NULL,
  `name_type` text DEFAULT 'personal' NOT NULL,
  `variants` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL
);--> statement-breakpoint
ALTER TABLE `resources` ADD `issn` text;--> statement-breakpoint
ALTER TABLE `resources` ADD `subject_headings` text;--> statement-breakpoint
ALTER TABLE `resources` ADD `author_authority_id` integer REFERENCES `authority_names`(`id`);
