ALTER TABLE `licenses` ADD `kind` text DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE `licenses` ADD `billing_period` text;--> statement-breakpoint
ALTER TABLE `licenses` ADD `purchase_date` text;