CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`due_date` text,
	`due_time` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`done_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`agent_status` text,
	`agent_chat_id` integer,
	`agent_result` text,
	`agent_error` text,
	`handed_off_at` integer
);
