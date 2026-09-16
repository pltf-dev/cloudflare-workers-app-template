CREATE TABLE `auth_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`link_token_hash` text,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`used_at` integer,
	`link_used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_codes_email_created_idx` ON `auth_codes` (`email`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_codes_link_token_idx` ON `auth_codes` (`link_token_hash`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`created_at` integer NOT NULL,
	`user_agent` text,
	`location` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);