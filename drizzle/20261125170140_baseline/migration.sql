CREATE TABLE `intake` (
	`actor` text NOT NULL,
	`agent` text NOT NULL,
	`asn` integer NOT NULL,
	`body` blob NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`encoding` text NOT NULL,
	`id` integer PRIMARY KEY,
	`ip` text NOT NULL,
	`kind` text NOT NULL,
	`network` text NOT NULL,
	`received_at` integer NOT NULL,
	`region` text NOT NULL,
	`seq` integer NOT NULL,
	`session` text NOT NULL,
	`site` text NOT NULL,
	`timezone` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `intake_actor_usage` (
	`actor` text NOT NULL,
	`batches` integer NOT NULL,
	`bytes` integer NOT NULL,
	`day` text NOT NULL,
	CONSTRAINT `intake_actor_usage_pk` PRIMARY KEY(`actor`, `day`)
);
--> statement-breakpoint
CREATE TABLE `intake_usage` (
	`network` text NOT NULL,
	`batches` integer NOT NULL,
	`bytes` integer NOT NULL,
	`day` text NOT NULL,
	CONSTRAINT `intake_usage_pk` PRIMARY KEY(`network`, `day`)
);
