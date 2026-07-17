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
    /** Status pipeline: nowy | do_kontaktu | obejrzany | odrzucony | oferta_zlozona (kept in sync with `flagged` for backward compat) */
    status: varchar("status", { length: 32 }).default("nowy").notNull(),
    /** Structured pros list (newline-separated), separate from general notes */
    pros: text("pros"),
    /** Structured cons list (newline-separated), separate from general notes */
    cons: text("cons"),
    /** Cached driving distance from family home base (km), recomputed when home base changes */
    distanceKm: float("distanceKm"),
    /** Cached driving time from family home base (minutes) */
    distanceMin: float("distanceMin"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    wojewodztwoIdx: index("wojewodztwoIdx").on(table.wojewodztwo),
    przeznaczeniIdx: index("przeznaczeniIdx").on(table.przeznaczenie),
    statusIdx: index("statusIdx").on(table.status),
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
    /** Optional author attribution (added later; old anonymous rows keep NULL) */
    userId: int("userId"),
    userName: varchar("userName", { length: 256 }),
  },
  (table) => ({
    listingIdIdx: index("listingIdIdx").on(table.listingId),
  })
);

export type Rating = typeof ratings.$inferSelect;
export type InsertRating = typeof ratings.$inferInsert;

// ─── Collaboration ────────────────────────────────────────────────────────────

/** Threaded, user-attributed notes per listing. `parentId` NULL = top-level note. */
export const listingNotes = mysqlTable(
  "listingNotes",
  {
    id: int("id").autoincrement().primaryKey(),
    listingId: int("listingId").notNull(),
    parentId: int("parentId"),
    userId: int("userId"),
    userName: varchar("userName", { length: 256 }),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    listingIdIdx: index("noteListingIdIdx").on(table.listingId),
    parentIdIdx: index("noteParentIdIdx").on(table.parentId),
  })
);

export type ListingNote = typeof listingNotes.$inferSelect;
export type InsertListingNote = typeof listingNotes.$inferInsert;

/** Simple activity feed: who did what, when. */
export const activityLog = mysqlTable(
  "activityLog",
  {
    id: int("id").autoincrement().primaryKey(),
    listingId: int("listingId"),
    userId: int("userId"),
    userName: varchar("userName", { length: 256 }),
    /** e.g. added_listing | status_change | note_added | rated | tagged | archived | price_change */
    action: varchar("action", { length: 64 }).notNull(),
    detail: varchar("detail", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    createdAtIdx: index("activityCreatedAtIdx").on(table.createdAt),
  })
);

export type ActivityEntry = typeof activityLog.$inferSelect;

// ─── Tags ─────────────────────────────────────────────────────────────────────

/** User-manageable tag definitions (color-coded pills). */
export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  /** Tailwind-friendly color key: green | blue | red | yellow | purple | pink | orange | teal | slate */
  color: varchar("color", { length: 24 }).default("blue").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;

/** Many-to-many: listing ↔ tag */
export const listingTags = mysqlTable(
  "listingTags",
  {
    id: int("id").autoincrement().primaryKey(),
    listingId: int("listingId").notNull(),
    tagId: int("tagId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    listingIdIdx: index("ltListingIdIdx").on(table.listingId),
    tagIdIdx: index("ltTagIdIdx").on(table.tagId),
  })
);

// ─── Notifications ────────────────────────────────────────────────────────────

/** Per-user notifications: price drops, status changes, expired listings. */
export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    listingId: int("listingId"),
    /** price_drop | price_increase | status_change | listing_expired */
    type: varchar("type", { length: 32 }).notNull(),
    title: varchar("title", { length: 256 }).notNull(),
    body: varchar("body", { length: 512 }),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("notifUserIdIdx").on(table.userId),
    readIdx: index("notifReadIdx").on(table.read),
  })
);

export type Notification = typeof notifications.$inferSelect;

// ─── Settings & scoring ───────────────────────────────────────────────────────

/** Per-user settings (home base location etc.). One row per user. */
export const userSettings = mysqlTable(
  "userSettings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    homeBaseLabel: varchar("homeBaseLabel", { length: 256 }),
    homeBaseLat: decimal("homeBaseLat", { precision: 10, scale: 7 }),
    homeBaseLng: decimal("homeBaseLng", { precision: 11, scale: 7 }),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("settingsUserIdIdx").on(table.userId),
  })
);

export type UserSettings = typeof userSettings.$inferSelect;

/** Shared (family-wide) weighted scoring criteria, e.g. Lokalizacja / Cena / Rozmiar / Media. */
export const scoringCriteria = mysqlTable("scoringCriteria", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  /** Weight 1–10 */
  weight: int("weight").default(5).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ScoringCriterion = typeof scoringCriteria.$inferSelect;

/** Per-listing per-criterion score (1–5). One row per listing+criterion (family-shared value). */
export const criterionRatings = mysqlTable(
  "criterionRatings",
  {
    id: int("id").autoincrement().primaryKey(),
    listingId: int("listingId").notNull(),
    criterionId: int("criterionId").notNull(),
    score: int("score").notNull(), // 1–5
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    listingIdIdx: index("crListingIdIdx").on(table.listingId),
    criterionIdIdx: index("crCriterionIdIdx").on(table.criterionId),
  })
);

export type CriterionRating = typeof criterionRatings.$inferSelect;

// ─── Map: areas of interest ───────────────────────────────────────────────────

/** Custom polygons drawn on the map ("areas of interest"). Path stored as JSON [{lat,lng},...] */
export const areasOfInterest = mysqlTable("areasOfInterest", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).default("Obszar").notNull(),
  color: varchar("color", { length: 24 }).default("blue").notNull(),
  path: text("path").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AreaOfInterest = typeof areasOfInterest.$inferSelect;

// ─── Price history ────────────────────────────────────────────────────────────

/** Recorded price observations per listing (fills up as the activity checker runs). */
export const priceHistory = mysqlTable(
  "priceHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    listingId: int("listingId").notNull(),
    cena: varchar("cena", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    listingIdIdx: index("phListingIdIdx").on(table.listingId),
  })
);

export type PriceHistoryEntry = typeof priceHistory.$inferSelect;
