CREATE TABLE `demo_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor` text NOT NULL,
	`day` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `demo_generations_day` ON `demo_generations` (`day`);--> statement-breakpoint
CREATE INDEX `demo_generations_visitor_day` ON `demo_generations` (`visitor`,`day`);--> statement-breakpoint
CREATE TABLE `github_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL
);
