CREATE TABLE `playtest_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`seed` integer NOT NULL,
	`result` text NOT NULL,
	`books_submitted` integer NOT NULL,
	`goal` integer NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`voice_commands` integer DEFAULT 0 NOT NULL,
	`button_commands` integer DEFAULT 0 NOT NULL,
	`voice_failures` integer DEFAULT 0 NOT NULL,
	`avg_confidence` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
