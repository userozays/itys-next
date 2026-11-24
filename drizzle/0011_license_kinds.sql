-- QA Ö6: licenses get a kind. Before this, "no expiry date" was how a perpetual
-- license was entered, so those become perpetual; the rest are taken to be
-- yearly subscriptions, the most common case. Both can be corrected per license.
UPDATE `licenses` SET `kind` = 'perpetual', `billing_period` = NULL WHERE `expiry_date` IS NULL;--> statement-breakpoint
UPDATE `licenses` SET `kind` = 'subscription', `billing_period` = 'yearly' WHERE `expiry_date` IS NOT NULL;
