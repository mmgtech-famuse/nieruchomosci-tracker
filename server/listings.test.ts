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
