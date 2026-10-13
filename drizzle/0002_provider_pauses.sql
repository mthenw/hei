CREATE TABLE `provider_pauses` (
	`provider` text PRIMARY KEY NOT NULL,
	`until` integer NOT NULL,
	`reason` text NOT NULL
);
