import { and, asc, avg, count, desc, eq, inArray, like, max, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertListing, InsertUser, ListingNote,
  activityLog, areasOfInterest, criterionRatings, listingNotes, listingTags,
  listings, notifications, priceHistory, ratings, scoringCriteria, tags,
  userSettings, users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Listings ─────────────────────────────────────────────────────────────────

export async function getAllListings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(listings).orderBy(asc(listings.id));
}

export async function getListingsByFilters(filters: {
  wojewodztwo?: string;
  przeznaczenie?: string;
  search?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.wojewodztwo) conditions.push(eq(listings.wojewodztwo, filters.wojewodztwo));
  if (filters.przeznaczenie) conditions.push(eq(listings.przeznaczenie, filters.przeznaczenie));
  if (filters.search) {
    const q = `%${filters.search}%`;
    conditions.push(
      or(
        like(listings.miejscowosc, q),
        like(listings.gmina, q),
        like(listings.powiat, q),
        like(listings.wojewodztwo, q)
      )
    );
  }

  if (conditions.length === 0) return getAllListings();
  return db.select().from(listings).where(and(...conditions)).orderBy(asc(listings.id));
}

export async function insertListing(data: Omit<InsertListing, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Compute next sequential ID: MAX(id) + 1 (avoids auto_increment gaps)
  const maxResult = await db.select({ maxId: max(listings.id) }).from(listings);
  const nextId = (maxResult[0]?.maxId ?? 0) + 1;

  await db.insert(listings).values({ ...data, id: nextId });
  const rows = await db.select().from(listings).where(eq(listings.id, nextId)).limit(1);
  return rows[0];
}

export async function deleteListing(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(listings).where(eq(listings.id, id));
  // Also delete associated ratings
  await db.delete(ratings).where(eq(ratings.listingId, id));
  return { success: true };
}

export async function getListingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  return rows[0];
}

export async function updateListingNotes(id: number, notes: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(listings).set({ notes }).where(eq(listings.id, id));
  return { success: true };
}

export async function toggleFlag(id: number, flagged: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(listings).set({ flagged }).where(eq(listings.id, id));
  return { success: true, flagged };
}

export async function archiveListing(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(listings).set({ archived: true }).where(eq(listings.id, id));
  return { success: true };
}

export async function unarchiveListing(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(listings).set({ archived: false }).where(eq(listings.id, id));
  return { success: true };
}

// ─── Ratings ──────────────────────────────────────────────────────────────────

/** Add a rating (1–5) for a listing. Anonymous — no user tracking. */
export async function addRating(listingId: number, score: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (score < 1 || score > 5) throw new Error("Score must be 1–5");
  await db.insert(ratings).values({ listingId, score });
  return { success: true };
}

/** Get average score and vote count per listing */
export async function getRatingStats(): Promise<Record<number, { avg: number; count: number }>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db
    .select({
      listingId: ratings.listingId,
      avgScore: avg(ratings.score),
      voteCount: count(ratings.id),
    })
    .from(ratings)
    .groupBy(ratings.listingId);

  const result: Record<number, { avg: number; count: number }> = {};
  for (const row of rows) {
    result[row.listingId] = {
      avg: parseFloat(String(row.avgScore ?? 0)),
      count: Number(row.voteCount),
    };
  }
  return result;
}

// ─── Status pipeline ──────────────────────────────────────────────────────────

/** Update listing status; keeps legacy `flagged` in sync (do_kontaktu ⇔ flagged). */
export async function updateListingStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(listings).set({ status, flagged: status === "do_kontaktu" }).where(eq(listings.id, id));
  return { success: true, status };
}

/** Update a single generic field (pros/cons etc.) */
export async function updateListingProsCons(id: number, pros: string | null, cons: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(listings).set({ pros, cons }).where(eq(listings.id, id));
  return { success: true };
}

// ─── Threaded notes ───────────────────────────────────────────────────────────

export async function getNotesForListings(): Promise<ListingNote[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(listingNotes).orderBy(asc(listingNotes.createdAt));
}

export async function addNote(data: {
  listingId: number;
  parentId?: number | null;
  userId?: number | null;
  userName?: string | null;
  content: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(listingNotes).values({
    listingId: data.listingId,
    parentId: data.parentId ?? null,
    userId: data.userId ?? null,
    userName: data.userName ?? null,
    content: data.content,
  });
  return { success: true };
}

export async function deleteNote(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(listingNotes).where(eq(listingNotes.id, id));
  await db.delete(listingNotes).where(eq(listingNotes.parentId, id));
  return { success: true };
}

// ─── Activity log ─────────────────────────────────────────────────────────────

export async function logActivity(entry: {
  listingId?: number | null;
  userId?: number | null;
  userName?: string | null;
  action: string;
  detail?: string | null;
}) {
  const db = await getDb();
  if (!db) return; // activity logging is best-effort
  try {
    await db.insert(activityLog).values({
      listingId: entry.listingId ?? null,
      userId: entry.userId ?? null,
      userName: entry.userName ?? null,
      action: entry.action,
      detail: entry.detail ?? null,
    });
  } catch (err) {
    console.warn("[Activity] Failed to log:", err);
  }
}

export async function getActivityLog(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(limit);
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function getAllTags() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tags).orderBy(asc(tags.name));
}

export async function createTag(name: string, color: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(tags).values({ name, color });
  const rows = await db.select().from(tags).where(and(eq(tags.name, name), eq(tags.color, color))).orderBy(desc(tags.id)).limit(1);
  return rows[0];
}

export async function updateTag(id: number, name: string, color: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tags).set({ name, color }).where(eq(tags.id, id));
  return { success: true };
}

export async function deleteTag(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tags).where(eq(tags.id, id));
  await db.delete(listingTags).where(eq(listingTags.tagId, id));
  return { success: true };
}

/** Get all listing↔tag assignments */
export async function getListingTagMap() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(listingTags);
}

export async function assignTag(listingId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(listingTags)
    .where(and(eq(listingTags.listingId, listingId), eq(listingTags.tagId, tagId))).limit(1);
  if (existing.length === 0) {
    await db.insert(listingTags).values({ listingId, tagId });
  }
  return { success: true };
}

export async function unassignTag(listingId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(listingTags)
    .where(and(eq(listingTags.listingId, listingId), eq(listingTags.tagId, tagId)));
  return { success: true };
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotificationsForUser(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ c: count(notifications.id) }).from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return Number(rows[0]?.c ?? 0);
}

export async function markNotificationsRead(userId: number, ids?: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids && ids.length > 0) {
    await db.update(notifications).set({ read: true })
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)));
  } else {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  }
  return { success: true };
}

/** Create a notification for every known user (family-wide broadcast). */
export async function notifyAllUsers(n: {
  listingId?: number | null;
  type: string;
  title: string;
  body?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  try {
    const allUsers = await db.select({ id: users.id }).from(users);
    if (allUsers.length === 0) return;
    await db.insert(notifications).values(
      allUsers.map(u => ({
        userId: u.id,
        listingId: n.listingId ?? null,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
      }))
    );
  } catch (err) {
    console.warn("[Notifications] Failed to broadcast:", err);
  }
}

// ─── User settings (home base) ────────────────────────────────────────────────

export async function getSettingsForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return rows[0];
}

export async function upsertSettings(userId: number, data: {
  homeBaseLabel?: string | null;
  homeBaseLat?: string | null;
  homeBaseLng?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getSettingsForUser(userId);
  if (existing) {
    await db.update(userSettings).set(data).where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values({ userId, ...data });
  }
  return { success: true };
}

export async function updateListingDistance(id: number, distanceKm: number | null, distanceMin: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(listings).set({ distanceKm, distanceMin }).where(eq(listings.id, id));
  return { success: true };
}

// ─── Scoring criteria ─────────────────────────────────────────────────────────

export async function getCriteria() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scoringCriteria).orderBy(asc(scoringCriteria.sortOrder), asc(scoringCriteria.id));
}

export async function createCriterion(name: string, weight: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getCriteria();
  await db.insert(scoringCriteria).values({ name, weight, sortOrder: existing.length });
  return { success: true };
}

export async function updateCriterion(id: number, data: { name?: string; weight?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(scoringCriteria).set(data).where(eq(scoringCriteria.id, id));
  return { success: true };
}

export async function deleteCriterion(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(scoringCriteria).where(eq(scoringCriteria.id, id));
  await db.delete(criterionRatings).where(eq(criterionRatings.criterionId, id));
  return { success: true };
}

export async function getAllCriterionRatings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(criterionRatings);
}

export async function setCriterionScore(listingId: number, criterionId: number, score: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (score < 1 || score > 5) throw new Error("Score must be 1–5");
  const existing = await db.select().from(criterionRatings)
    .where(and(eq(criterionRatings.listingId, listingId), eq(criterionRatings.criterionId, criterionId))).limit(1);
  if (existing.length > 0) {
    await db.update(criterionRatings).set({ score })
      .where(and(eq(criterionRatings.listingId, listingId), eq(criterionRatings.criterionId, criterionId)));
  } else {
    await db.insert(criterionRatings).values({ listingId, criterionId, score });
  }
  return { success: true };
}

// ─── Areas of interest ────────────────────────────────────────────────────────

export async function getAreas() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(areasOfInterest).orderBy(asc(areasOfInterest.id));
}

export async function createArea(name: string, color: string, path: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(areasOfInterest).values({ name, color, path });
  const rows = await db.select().from(areasOfInterest).orderBy(desc(areasOfInterest.id)).limit(1);
  return rows[0];
}

export async function updateArea(id: number, data: { name?: string; color?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(areasOfInterest).set(data).where(eq(areasOfInterest.id, id));
  return { success: true };
}

export async function deleteArea(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(areasOfInterest).where(eq(areasOfInterest.id, id));
  return { success: true };
}

// ─── Price history ────────────────────────────────────────────────────────────

export async function getPriceHistory() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(priceHistory).orderBy(asc(priceHistory.createdAt));
}

export async function recordPrice(listingId: number, cena: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(priceHistory).values({ listingId, cena });
  return { success: true };
}

export async function updateListingPrice(id: number, cena: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(listings).set({ cena }).where(eq(listings.id, id));
  return { success: true };
}

// ─── Rating with attribution (backward-compatible wrapper) ────────────────────

/** Add a rating with optional user attribution (legacy anonymous path preserved). */
export async function addRatingWithUser(listingId: number, score: number, userId?: number | null, userName?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (score < 1 || score > 5) throw new Error("Score must be 1–5");
  await db.insert(ratings).values({ listingId, score, userId: userId ?? null, userName: userName ?? null });
  return { success: true };
}

/** Per-listing list of raters (latest rating per user) for avatar display. */
export async function getRatingRaters(): Promise<Record<number, { userName: string; score: number }[]>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(ratings).orderBy(asc(ratings.createdAt));
  const result: Record<number, { userName: string; score: number }[]> = {};
  for (const row of rows) {
    if (!row.userName) continue;
    if (!result[row.listingId]) result[row.listingId] = [];
    const arr = result[row.listingId];
    const idx = arr.findIndex(r => r.userName === row.userName);
    if (idx >= 0) arr[idx] = { userName: row.userName, score: row.score };
    else arr.push({ userName: row.userName, score: row.score });
  }
  return result;
}
