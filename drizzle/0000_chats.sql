CREATE TABLE `chats` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`title_by_user` integer DEFAULT false NOT NULL,
	`start_request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_start_request_id_unique` ON `chats` (`start_request_id`);