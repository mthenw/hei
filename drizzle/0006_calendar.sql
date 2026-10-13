CREATE TABLE `calendar_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`secret` text NOT NULL,
	`error` text,
	`synced_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`calendar_id` integer NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`notes` text,
	`all_day` integer NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`url` text,
	`todo_id` integer,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calendar_events_range` ON `calendar_events` (`start_ms`,`end_ms`);--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_calendar_id_external_id_unique` ON `calendar_events` (`calendar_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`writable` integer NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`sync_token` text,
	FOREIGN KEY (`account_id`) REFERENCES `calendar_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendars_account_id_external_id_unique` ON `calendars` (`account_id`,`external_id`);