CREATE TABLE `calendar_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer,
	`summary` text NOT NULL,
	`changes` text NOT NULL,
	`status` text NOT NULL,
	`applied` text,
	`error` text,
	`created_at` integer NOT NULL,
	`decided_at` integer
);
