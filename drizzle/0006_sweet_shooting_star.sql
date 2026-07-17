CREATE TABLE `activityLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int,
	`userId` int,
	`userName` varchar(256),
	`action` varchar(64) NOT NULL,
	`detail` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `areasOfInterest` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL DEFAULT 'Obszar',
	`color` varchar(24) NOT NULL DEFAULT 'blue',
	`path` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `areasOfInterest_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `criterionRatings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`criterionId` int NOT NULL,
	`score` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `criterionRatings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listingNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`parentId` int,
	`userId` int,
	`userName` varchar(256),
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `listingNotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listingTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`tagId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listingTags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`listingId` int,
	`type` varchar(32) NOT NULL,
	`title` varchar(256) NOT NULL,
	`body` varchar(512),
	`read` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `priceHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`cena` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `priceHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scoringCriteria` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`weight` int NOT NULL DEFAULT 5,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scoringCriteria_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`color` varchar(24) NOT NULL DEFAULT 'blue',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`homeBaseLabel` varchar(256),
	`homeBaseLat` decimal(10,7),
	`homeBaseLng` decimal(11,7),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `listings` ADD `status` varchar(32) DEFAULT 'nowy' NOT NULL;--> statement-breakpoint
ALTER TABLE `listings` ADD `pros` text;--> statement-breakpoint
ALTER TABLE `listings` ADD `cons` text;--> statement-breakpoint
ALTER TABLE `listings` ADD `distanceKm` float;--> statement-breakpoint
ALTER TABLE `listings` ADD `distanceMin` float;--> statement-breakpoint
ALTER TABLE `ratings` ADD `userId` int;--> statement-breakpoint
ALTER TABLE `ratings` ADD `userName` varchar(256);--> statement-breakpoint
CREATE INDEX `activityCreatedAtIdx` ON `activityLog` (`createdAt`);--> statement-breakpoint
CREATE INDEX `crListingIdIdx` ON `criterionRatings` (`listingId`);--> statement-breakpoint
CREATE INDEX `crCriterionIdIdx` ON `criterionRatings` (`criterionId`);--> statement-breakpoint
CREATE INDEX `noteListingIdIdx` ON `listingNotes` (`listingId`);--> statement-breakpoint
CREATE INDEX `noteParentIdIdx` ON `listingNotes` (`parentId`);--> statement-breakpoint
CREATE INDEX `ltListingIdIdx` ON `listingTags` (`listingId`);--> statement-breakpoint
CREATE INDEX `ltTagIdIdx` ON `listingTags` (`tagId`);--> statement-breakpoint
CREATE INDEX `notifUserIdIdx` ON `notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `notifReadIdx` ON `notifications` (`read`);--> statement-breakpoint
CREATE INDEX `phListingIdIdx` ON `priceHistory` (`listingId`);--> statement-breakpoint
CREATE INDEX `settingsUserIdIdx` ON `userSettings` (`userId`);--> statement-breakpoint
CREATE INDEX `statusIdx` ON `listings` (`status`);--> statement-breakpoint
UPDATE `listings` SET `status` = 'do_kontaktu' WHERE `flagged` = true AND `status` = 'nowy';