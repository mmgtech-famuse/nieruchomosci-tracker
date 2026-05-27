import { and, asc, eq, like, max, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertListing, InsertUser, listings, users } from "../drizzle/schema";
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
  return { success: true };
}

export async function getListingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  return rows[0];
}
