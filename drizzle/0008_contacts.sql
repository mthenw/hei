CREATE TABLE `contact_syncs` (
	`account_id` integer NOT NULL,
	`list` text NOT NULL,
	`sync_token` text,
	`synced_at` integer,
	`error` text,
	PRIMARY KEY(`account_id`, `list`),
	FOREIGN KEY (`account_id`) REFERENCES `calendar_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`resource_name` text NOT NULL,
	`saved` integer NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`emails` text NOT NULL,
	`phones` text NOT NULL,
	`organization` text,
	`search` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `calendar_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contacts_email` ON `contacts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_account_id_resource_name_unique` ON `contacts` (`account_id`,`resource_name`);--> statement-breakpoint
ALTER TABLE `calendar_accounts` ADD `scopes` text;