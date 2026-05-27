ALTER TABLE `listings` MODIFY COLUMN `url` varchar(2048) NOT NULL;--> statement-breakpoint
ALTER TABLE `listings` MODIFY COLUMN `media` varchar(512) NOT NULL DEFAULT '-';--> statement-breakpoint
ALTER TABLE `listings` MODIFY COLUMN `zabudowania` varchar(512) NOT NULL DEFAULT '-';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(256);