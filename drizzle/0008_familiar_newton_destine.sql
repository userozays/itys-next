CREATE INDEX `assets_company_tag_upper` ON `assets` (`company_id`,upper("tag"));--> statement-breakpoint
CREATE INDEX `assets_company_serial_upper` ON `assets` (`company_id`,upper("serial"));--> statement-breakpoint
CREATE INDEX `assets_company_mac_upper` ON `assets` (`company_id`,upper("mac_address"));--> statement-breakpoint
CREATE INDEX `assets_company_ip` ON `assets` (`company_id`,`ip_address`);