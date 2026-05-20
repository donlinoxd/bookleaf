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
