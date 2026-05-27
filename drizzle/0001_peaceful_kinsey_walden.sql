CREATE TABLE `listings` (
`id` int AUTO_INCREMENT NOT NULL,
`url` varchar(2048) NOT NULL,
`wojewodztwo` varchar(64) NOT NULL DEFAULT '-',
`powiat` varchar(64) NOT NULL DEFAULT '-',
`gmina` varchar(64) NOT NULL DEFAULT '-',
`miejscowosc` varchar(128) NOT NULL DEFAULT '-',
`rozmiarDzialki` varchar(128) NOT NULL DEFAULT '-',
`media` varchar(512) NOT NULL DEFAULT '-',
`przeznaczenie` varchar(256) NOT NULL DEFAULT '-',
`zabudowania` varchar(512) NOT NULL DEFAULT '-',
`cena` varchar(128) NOT NULL DEFAULT '-',
`latitude` decimal(10,7),
`longitude` decimal(11,7),
`createdAt` timestamp NOT NULL DEFAULT (now()),
`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
CONSTRAINT `listings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `wojewodztwoIdx` ON `listings` (`wojewodztwo`);
