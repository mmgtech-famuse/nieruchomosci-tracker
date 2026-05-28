import { boolean, decimal, float, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 256 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const listings = mysqlTable(
  "listings",
  {
    id: int("id").autoincrement().primaryKey(),
    url: varchar("url", { length: 2048 }).notNull(),
    wojewodztwo: varchar("wojewodztwo", { length: 64 }).notNull().default("-"),
    powiat: varchar("powiat", { length: 64 }).notNull().default("-"),
    gmina: varchar("gmina", { length: 64 }).notNull().default("-"),
    miejscowosc: varchar("miejscowosc", { length: 128 }).notNull().default("-"),
    rozmiarDzialki: varchar("rozmiarDzialki", { length: 128 }).notNull().default("-"),
    media: varchar("media", { length: 512 }).notNull().default("-"),
    przeznaczenie: varchar("przeznaczenie", { length: 256 }).notNull().default("-"),
    zabudowania: varchar("zabudowania", { length: 512 }).notNull().default("-"),
    cena: varchar("cena", { length: 128 }).notNull().default("-"),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 11, scale: 7 }),
    notes: text("notes"),
    archived: boolean("archived").default(false).notNull(),
    flagged: boolean("flagged").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    wojewodztwoIdx: index("wojewodztwoIdx").on(table.wojewodztwo),
    przeznaczeniIdx: index("przeznaczeniIdx").on(table.przeznaczenie),
  })
);

export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;

// Ratings: one row per vote (anonymous, no user tracking)
export const ratings = mysqlTable(
  "ratings",
  {
    id: int("id").autoincrement().primaryKey(),
    listingId: int("listingId").notNull(),
    score: int("score").notNull(), // 1–5
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    listingIdIdx: index("listingIdIdx").on(table.listingId),
  })
);

export type Rating = typeof ratings.$inferSelect;
export type InsertRating = typeof ratings.$inferInsert;
