CREATE TABLE `profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`about` text DEFAULT '' NOT NULL,
	`time_zone` text DEFAULT 'Europe/Warsaw' NOT NULL,
	`reply_language` text,
	`instructions` text,
	`updated_at` integer NOT NULL
);
