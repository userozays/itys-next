CREATE TABLE `import_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`user_id` integer,
	`filename` text NOT NULL,
	`headers` text NOT NULL,
	`rows` text NOT NULL,
	`mapping` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`report` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
