import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mock the db module ────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getAllListings: vi.fn().mockResolvedValue([
    {
      id: 1,
      url: "https://example.com/1",
      wojewodztwo: "mazowieckie",
      powiat: "warszawski",
      gmina: "Warszawa",
      miejscowosc: "Warszawa",
      rozmiarDzialki: "1000 m²",
      media: "prąd, woda",
      przeznaczenie: "budowlana",
      zabudowania: "-",
      cena: "250 000 zł",
      latitude: "52.2297",
      longitude: "21.0122",
      archived: false,
      flagged: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      url: "https://example.com/2",
      wojewodztwo: "łódzkie",
      powiat: "łódzki",
      gmina: "Łódź",
      miejscowosc: "Łódź",
      rozmiarDzialki: "2000 m²",
      media: "prąd",
      przeznaczenie: "rolna",
      zabudowania: "dom",
      cena: "350 000 zł",
      latitude: "51.7592",
      longitude: "19.4560",
      archived: false,
      flagged: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getListingsByFilters: vi.fn().mockResolvedValue([]),
  insertListing: vi.fn().mockResolvedValue({ id: 99, url: "https://example.com/new" }),
  deleteListing: vi.fn().mockResolvedValue({ success: true }),
  updateListingNotes: vi.fn().mockResolvedValue({ success: true }),
  addRating: vi.fn().mockResolvedValue({ success: true }),
  getRatingStats: vi.fn().mockResolvedValue({ 1: { avg: 4.5, count: 2 }, 2: { avg: 3.0, count: 1 } }),
  archiveListing: vi.fn().mockResolvedValue({ success: true }),
  unarchiveListing: vi.fn().mockResolvedValue({ success: true }),
  toggleFlag: vi.fn().mockResolvedValue({ success: true, flagged: true }),
  // ── New collaboration/insight helpers ──
  addRatingWithUser: vi.fn().mockResolvedValue({ success: true }),
  getRatingRaters: vi.fn().mockResolvedValue({ 1: [{ userName: "Anna", score: 5 }] }),
  logActivity: vi.fn().mockResolvedValue(undefined),
  getActivityLog: vi.fn().mockResolvedValue([]),
  updateListingStatus: vi.fn().mockImplementation((_id: number, status: string) => Promise.resolve({ success: true, status })),
  updateListingProsCons: vi.fn().mockResolvedValue({ success: true }),
  getListingById: vi.fn().mockResolvedValue({ id: 1, status: "nowy", flagged: false }),
  getNotesForListings: vi.fn().mockResolvedValue([]),
  addNote: vi.fn().mockResolvedValue({ success: true }),
  deleteNote: vi.fn().mockResolvedValue({ success: true }),
  getAllTags: vi.fn().mockResolvedValue([{ id: 1, name: "Blisko lasu", color: "green", createdAt: new Date() }]),
  createTag: vi.fn().mockResolvedValue({ id: 2, name: "Nowy tag", color: "blue", createdAt: new Date() }),
  updateTag: vi.fn().mockResolvedValue({ success: true }),
  deleteTag: vi.fn().mockResolvedValue({ success: true }),
  getListingTagMap: vi.fn().mockResolvedValue([{ id: 1, listingId: 1, tagId: 1, createdAt: new Date() }]),
  assignTag: vi.fn().mockResolvedValue({ success: true }),
  unassignTag: vi.fn().mockResolvedValue({ success: true }),
  getNotificationsForUser: vi.fn().mockResolvedValue([]),
  getUnreadCount: vi.fn().mockResolvedValue(0),
  markNotificationsRead: vi.fn().mockResolvedValue({ success: true }),
  notifyAllUsers: vi.fn().mockResolvedValue(undefined),
  getSettingsForUser: vi.fn().mockResolvedValue(undefined),
  upsertSettings: vi.fn().mockResolvedValue({ success: true }),
  updateListingDistance: vi.fn().mockResolvedValue({ success: true }),
  getCriteria: vi.fn().mockResolvedValue([{ id: 1, name: "Lokalizacja", weight: 8, sortOrder: 0, createdAt: new Date() }]),
  createCriterion: vi.fn().mockResolvedValue({ success: true }),
  updateCriterion: vi.fn().mockResolvedValue({ success: true }),
  deleteCriterion: vi.fn().mockResolvedValue({ success: true }),
  getAllCriterionRatings: vi.fn().mockResolvedValue([{ id: 1, listingId: 1, criterionId: 1, score: 4, updatedAt: new Date() }]),
  setCriterionScore: vi.fn().mockResolvedValue({ success: true }),
  getAreas: vi.fn().mockResolvedValue([]),
  createArea: vi.fn().mockResolvedValue({ id: 1, name: "Obszar", color: "blue", path: "[]", createdAt: new Date() }),
  updateArea: vi.fn().mockResolvedValue({ success: true }),
  deleteArea: vi.fn().mockResolvedValue({ success: true }),
  getPriceHistory: vi.fn().mockResolvedValue([]),
  recordPrice: vi.fn().mockResolvedValue({ success: true }),
  updateListingPrice: vi.fn().mockResolvedValue({ success: true }),
}));

// ── Mock LLM and map ──────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            wojewodztwo: "mazowieckie",
            powiat: "warszawski",
            gmina: "Warszawa",
            miejscowosc: "Warszawa",
            rozmiarDzialki: "500 m²",
            media: "prąd, woda",
            przeznaczenie: "budowlana",
            zabudowania: "-",
            cena: "300 000 zł",
          }),
        },
      },
    ],
  }),
}));

vi.mock("./_core/map", () => ({
  makeRequest: vi.fn().mockResolvedValue({
    results: [{ geometry: { location: { lat: 52.2297, lng: 21.0122 } } }],
  }),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("listings.getAll", () => {
  it("returns all listings from the database", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.getAll();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({ id: 1, miejscowosc: "Warszawa" });
  });
});

describe("listings.getFiltered", () => {
  it("accepts filter parameters without throwing", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.getFiltered({
      wojewodztwo: "mazowieckie",
      przeznaczenie: "budowlana",
      search: "Warszawa",
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("listings.delete", () => {
  it("deletes a listing by id", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.delete({ id: 1 });
    expect(result).toMatchObject({ success: true });
  });

  it("rejects invalid id (non-positive)", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.listings.delete({ id: -1 })).rejects.toThrow();
  });
});

describe("listings.submitUrl", () => {
  it("rejects invalid URL", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.listings.submitUrl({ url: "not-a-url" })).rejects.toThrow();
  });
});

describe("listings.addRating", () => {
  it("accepts valid score 1-5", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.addRating({ listingId: 1, score: 4 });
    expect(result).toMatchObject({ success: true });
  });

  it("rejects score out of range", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.listings.addRating({ listingId: 1, score: 6 })).rejects.toThrow();
    await expect(caller.listings.addRating({ listingId: 1, score: 0 })).rejects.toThrow();
  });
});

describe("listings.updateNotes", () => {
  it("saves notes for a listing", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.updateNotes({ id: 1, notes: "Warto zadzwonić" });
    expect(result).toMatchObject({ success: true });
  });

  it("rejects notes longer than 2000 chars", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.listings.updateNotes({ id: 1, notes: "x".repeat(2001) })).rejects.toThrow();
  });
});

describe("listings.getRatingStats", () => {
  it("returns rating stats keyed by listing id", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.getRatingStats();
    expect(result[1]).toMatchObject({ avg: 4.5, count: 2 });
    expect(result[2]).toMatchObject({ avg: 3.0, count: 1 });
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toMatchObject({ success: true });
  });
});

describe("listings.archiveListing", () => {
  it("archives a listing by id", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.archiveListing({ id: 1 });
    expect(result).toMatchObject({ success: true });
  });
});

describe("listings.unarchiveListing", () => {
  it("restores an archived listing by id", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.unarchiveListing({ id: 1 });
    expect(result).toMatchObject({ success: true });
  });
});

describe("listings.toggleFlag", () => {
  it("flags a listing by id", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.toggleFlag({ id: 1, flagged: true });
    expect(result).toMatchObject({ success: true, flagged: true });
  });

  it("unflags a listing by id", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.toggleFlag({ id: 1, flagged: false });
    expect(result).toMatchObject({ success: true });
  });
});

describe("listings.updateStatus", () => {
  it("updates the status pipeline value", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.updateStatus({ id: 1, status: "obejrzany" });
    expect(result).toMatchObject({ success: true, status: "obejrzany" });
  });

  it("rejects an unknown status", async () => {
    const caller = appRouter.createCaller(createCtx());
    // @ts-expect-error invalid status on purpose
    await expect(caller.listings.updateStatus({ id: 1, status: "bogus" })).rejects.toThrow();
  });
});

describe("listings.updateProsCons", () => {
  it("saves pros and cons", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.listings.updateProsCons({ id: 1, pros: "Blisko lasu", cons: "Daleko od drogi" });
    expect(result).toMatchObject({ success: true });
  });
});

describe("notes", () => {
  it("adds a top-level note", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.notes.add({ listingId: 1, content: "Zadzwonić jutro" });
    expect(result).toMatchObject({ success: true });
  });

  it("adds a threaded reply", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.notes.add({ listingId: 1, parentId: 1, content: "Już dzwoniłem" });
    expect(result).toMatchObject({ success: true });
  });

  it("rejects empty content", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.notes.add({ listingId: 1, content: "" })).rejects.toThrow();
  });
});

describe("tags", () => {
  it("lists tags", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tags.getAll();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({ name: "Blisko lasu" });
  });

  it("assigns a tag to a listing", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tags.assign({ listingId: 1, tagId: 1 });
    expect(result).toMatchObject({ success: true });
  });
});

describe("scoring", () => {
  it("returns criteria list", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.scoring.getCriteria();
    expect(result[0]).toMatchObject({ name: "Lokalizacja", weight: 8 });
  });

  it("returns scores map keyed by listing", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.scoring.getScores();
    expect(result[1]).toMatchObject({ 1: 4 });
  });

  it("rejects score out of range", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.scoring.setScore({ listingId: 1, criterionId: 1, score: 9 })).rejects.toThrow();
  });
});

describe("notifications", () => {
  it("returns empty list for anonymous user", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.notifications.getMine();
    expect(result).toEqual([]);
  });

  it("returns zero unread for anonymous user", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.notifications.unreadCount();
    expect(result).toBe(0);
  });
});

describe("activity", () => {
  it("returns recent activity entries", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.activity.getRecent({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("areas", () => {
  it("creates an area of interest", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.areas.create({ name: "Okolice Warszawy", color: "blue", path: JSON.stringify([{ lat: 52, lng: 21 }]) });
    expect(result).toMatchObject({ id: 1 });
  });
});
