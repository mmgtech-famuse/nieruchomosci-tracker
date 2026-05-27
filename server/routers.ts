import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Normalize price string to Polish format: "350 000 zł" */
function normalizePrice(raw: string): string {
  if (!raw || raw === "-" || raw.toLowerCase().includes("brak") || raw === "N/A") return "-";
  // Remove currency symbols, keep digits and spaces
  const digits = raw.replace(/[^\d\s]/g, "").trim().replace(/\s+/g, " ");
  if (!digits) return raw;
  const num = parseInt(digits.replace(/\s/g, ""), 10);
  if (isNaN(num) || num < 1000) return raw;
  // Format with spaces as thousands separator
  const formatted = num.toLocaleString("pl-PL").replace(/,/g, " ");
  return `${formatted} zł`;
}

/** Normalize a location field — strip "brak danych", "N/A", etc. */
function normLoc(val: string): string {
  if (!val) return "-";
  const v = val.trim();
  if (["brak danych", "n/a", "brak", "nieznane", "unknown", "null", "none"].includes(v.toLowerCase())) return "-";
  return v;
}

/** Normalize przeznaczenie to legal Polish land category tags */
function normalizePrzeznaczenie(raw: string): string {
  if (!raw || raw === "-") return "inne/brak danych";
  const r = raw.toLowerCase().trim();
  const tags: string[] = [];
  if (r.includes("budowlana") || r.includes("budowl") || r.includes("mieszkaniowa") || r.includes("usługowa") || r.includes("przemysłowa")) tags.push("budowlana");
  if (r.includes("siedlisk") || r.includes("zagroda") || r.includes("zagrodowa")) tags.push("siedliskowa");
  if (r.includes("leśna") || r.includes("lesna") || r.includes(" las") || r.includes("leśn")) tags.push("leśna");
  if (r.includes("rekre") || r.includes("letnisk") || r.includes("wypocz") || r.includes("turyst")) tags.push("rekreacyjna");
  if (r.includes("rolna") || r.includes("rolno") || r.includes("rolnicza")) tags.push("rolna");
  if (r.includes(" wz") || r === "wz" || r.includes("warunki zabudowy")) tags.push("WZ");
  if (tags.length === 0) return "inne/brak danych";
  return Array.from(new Set(tags)).join(", ");
}

/** Strip HTML tags and collapse whitespace, return up to maxLen chars */
function stripHtml(html: string, maxLen = 10000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** Extract OLX structured data from JSON-LD or meta tags */
function extractOlxData(html: string): string {
  // OLX embeds data in window.__PRERENDERED_STATE__ or similar
  const priceMatch = html.match(/"price":\s*\{[^}]*"value":\s*"?(\d[\d\s]*)"?/);
  const cityMatch = html.match(/"city":\s*"([^"]+)"/);
  const regionMatch = html.match(/"region":\s*"([^"]+)"/);
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);

  const parts: string[] = [];
  if (titleMatch) parts.push(`Tytuł: ${titleMatch[1]}`);
  if (descMatch) parts.push(`Opis: ${descMatch[1]}`);
  if (priceMatch) parts.push(`Cena: ${priceMatch[1]} zł`);
  if (cityMatch) parts.push(`Miasto: ${cityMatch[1]}`);
  if (regionMatch) parts.push(`Region: ${regionMatch[1]}`);

  return parts.join("\n");
}

/** Fetch a URL with proper browser-like headers, return HTML string or null */
async function fetchPage(url: string): Promise<string | null> {
  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
  };

  try {
    const resp = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (!resp.ok) {
      console.warn(`[Fetch] HTTP ${resp.status} for ${url}`);
      return null;
    }
    const html = await resp.text();
    return html.length > 200 ? html : null;
  } catch (err) {
    console.warn(`[Fetch] Error fetching ${url}:`, err);
    return null;
  }
}

/** Build extraction prompt based on portal type and available content */
function buildPrompt(url: string, pageText: string | null, extraMeta: string): string {
  const isFacebook = url.includes("facebook.com");
  const isOlx = url.includes("olx.pl");
  const isOtodom = url.includes("otodom.pl");

  const FIELDS_DESC = `Zwróć TYLKO poprawny obiekt JSON z tymi polami:
{
  "wojewodztwo": "nazwa województwa małymi literami (np. 'mazowieckie') lub '-' jeśli nieznane",
  "powiat": "nazwa powiatu małymi literami lub '-'",
  "gmina": "nazwa gminy lub '-'",
  "miejscowosc": "nazwa miejscowości lub '-'",
  "rozmiarDzialki": "rozmiar działki z jednostką (np. '1500 m²', '0.5 ha', '3000 m2') lub '-'",
  "media": "dostępne media oddzielone przecinkami (prąd, woda, gaz, szambo, kanalizacja, internet itp.) lub '-'",
  "przeznaczenie": "Podaj przeznaczenie jako LISTĘ TAGÓW oddzielonych przecinkiem. Używaj WYŁĄCZNIE:\n- budowlana: pod zabudowę mieszkaniową/usługową/przemysłową\n- rolna: działalność rolnicza, wymaga odrolnienia\n- siedliskowa: zabudowa zagrodowa dla rolnika\n- leśna: las lub cele leśne\n- rekreacyjna: wypoczynek, letniskowa, turystyczna\n- WZ: ma wydane warunki zabudowy\n- inne/brak danych: brak info\nPrzykłady: 'rolna, WZ' / 'rolna, budowlana' / 'siedliskowa, leśna, rolna'",
  "zabudowania": "opis zabudowań (dom, stodoła, garaż itp.) lub '-'",
  "cena": "cena w formacie '250 000 zł' lub '-' jeśli brak"
}`;

  if (isFacebook) {
    return `Jesteś ekspertem od polskich ogłoszeń nieruchomości z grupy Facebook.
URL grupy: ${url}

Niestety Facebook blokuje automatyczne pobieranie treści. Na podstawie URL grupy (${url.includes("siedlisko") ? "grupa o siedliskach/działkach wiejskich" : "ogłoszenia nieruchomości"}) i ewentualnych metadanych, spróbuj wyciągnąć co możliwe.

${extraMeta ? `Metadane strony:\n${extraMeta}\n` : ""}

${FIELDS_DESC}

WAŻNE: Jeśli nie możesz określić wartości, użyj '-'. NIE wymyślaj danych.`;
  }

  if (pageText) {
    return `Jesteś ekspertem od polskich ogłoszeń nieruchomości. Przeanalizuj poniższy tekst ze strony ogłoszenia i wyciągnij dane.

URL: ${url}
${extraMeta ? `\nDODATKOWE METADANE:\n${extraMeta}\n` : ""}
TREŚĆ STRONY:
${pageText}

${FIELDS_DESC}

WSKAZÓWKI:
- Szukaj ceny w formacie "XXX 000 zł" lub "XXX000 PLN" — przelicz na format "XXX 000 zł"
- Województwo zawsze małymi literami (mazowieckie, łódzkie, podlaskie itp.)
- Rozmiar działki: szukaj m², ha, ar, m2 — zachowaj jednostkę
- Media: prąd/energia elektryczna, woda/wodociąg/studnia, gaz, szambo/kanalizacja, internet
- Przeznaczenie: szukaj słów kluczowych: budowlana, rolna, siedliskowa, leśna, rekreacyjna/letniskowa, WZ/warunki zabudowy`;
  }

  return `Przeanalizuj URL ogłoszenia nieruchomości i wyciągnij co możesz z samego linku i metadanych.
URL: ${url}
${extraMeta ? `\nMetadane:\n${extraMeta}\n` : ""}
${FIELDS_DESC}
Użyj '-' dla pól których nie możesz określić.`;
}

// ── Router ─────────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  listings: router({
    getAll: publicProcedure.query(async () => {
      const { getAllListings } = await import("./db");
      return getAllListings();
    }),

    getFiltered: publicProcedure
      .input(
        z.object({
          wojewodztwo: z.string().optional(),
          przeznaczenie: z.string().optional(),
          search: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        const { getListingsByFilters } = await import("./db");
        return getListingsByFilters(input);
      }),

    submitUrl: publicProcedure
      .input(z.object({ url: z.string().url("Podaj poprawny URL") }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const { makeRequest } = await import("./_core/map");
        const { insertListing } = await import("./db");

        const isFacebook = input.url.includes("facebook.com");

        // ── Step 1: Fetch page content ──────────────────────────────────────
        let pageText: string | null = null;
        let extraMeta = "";
        let fetchSuccess = false;

        if (!isFacebook) {
          const html = await fetchPage(input.url);
          if (html) {
            // Extract OLX/Otodom specific structured data first
            extraMeta = extractOlxData(html);
            // Strip HTML for LLM context
            pageText = stripHtml(html, 10000);
            fetchSuccess = pageText.length > 200;
            if (!fetchSuccess) pageText = null;
          }
        } else {
          // Facebook: try to get at least title/meta from the page
          const html = await fetchPage(input.url);
          if (html) {
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            const ogTitle = html.match(/property="og:title"[^>]+content="([^"]+)"/i);
            const ogDesc = html.match(/property="og:description"[^>]+content="([^"]+)"/i);
            if (titleMatch) extraMeta += `Tytuł: ${titleMatch[1]}\n`;
            if (ogTitle) extraMeta += `OG Title: ${ogTitle[1]}\n`;
            if (ogDesc) extraMeta += `OG Opis: ${ogDesc[1]}\n`;
          }
        }

        // ── Step 2: AI extraction ───────────────────────────────────────────
        const extractionPrompt = buildPrompt(input.url, pageText, extraMeta);

        let extracted: Record<string, string> = {};
        try {
          const aiResponse = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "Jesteś precyzyjnym ekstraherem danych z polskich ogłoszeń nieruchomości. Zawsze zwracaj TYLKO poprawny JSON bez żadnego dodatkowego tekstu.",
              },
              { role: "user", content: extractionPrompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "property_listing",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    wojewodztwo: { type: "string" },
                    powiat: { type: "string" },
                    gmina: { type: "string" },
                    miejscowosc: { type: "string" },
                    rozmiarDzialki: { type: "string" },
                    media: { type: "string" },
                    przeznaczenie: { type: "string" },
                    zabudowania: { type: "string" },
                    cena: { type: "string" },
                  },
                  required: ["wojewodztwo", "powiat", "gmina", "miejscowosc", "rozmiarDzialki", "media", "przeznaczenie", "zabudowania", "cena"],
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = (aiResponse.choices[0]?.message?.content || "{}") as string;
          extracted = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
        } catch (aiErr) {
          console.error("[AI Extraction] Failed:", aiErr);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Nie udało się wyekstrahować danych z ogłoszenia. Spróbuj ponownie.",
          });
        }

        // ── Step 3: Normalize extracted fields ─────────────────────────────
        const woj = normLoc(extracted.wojewodztwo || "-").toLowerCase();
        const pow = normLoc(extracted.powiat || "-").toLowerCase();
        const gmi = normLoc(extracted.gmina || "-");
        const mie = normLoc(extracted.miejscowosc || "-");
        const roz = normLoc(extracted.rozmiarDzialki || "-");
        const med = normLoc(extracted.media || "-");
        const zab = normLoc(extracted.zabudowania || "-");
        const cen = normalizePrice(extracted.cena || "-");
        const prz = normalizePrzeznaczenie(extracted.przeznaczenie || "-");

        // ── Step 4: Geocoding ───────────────────────────────────────────────
        let latitude: string | null = null;
        let longitude: string | null = null;

        // Build geocoding query from best available location data
        const locParts = [mie, gmi, pow, woj]
          .filter(p => p && p !== "-" && p.length > 1)
          .slice(0, 3); // Use up to 3 most specific parts

        if (locParts.length >= 1) {
          const geoQuery = [...locParts, "Polska"].join(", ");
          try {
            const geoResult = (await makeRequest("geocode", {
              address: geoQuery,
            })) as any;
            if (geoResult?.results?.[0]?.geometry?.location) {
              const loc = geoResult.results[0].geometry.location;
              latitude = String(loc.lat);
              longitude = String(loc.lng);
              console.log(`[Geocoding] OK: "${geoQuery}" → ${latitude}, ${longitude}`);
            } else {
              console.warn(`[Geocoding] No results for: "${geoQuery}"`);
            }
          } catch (geoErr) {
            console.warn("[Geocoding] Failed:", geoErr);
          }
        } else {
          console.warn("[Geocoding] Skipped — no location data available");
        }

        // ── Step 5: Save to DB ──────────────────────────────────────────────
        const newListing = await insertListing({
          url: input.url,
          wojewodztwo: woj,
          powiat: pow,
          gmina: gmi,
          miejscowosc: mie,
          rozmiarDzialki: roz,
          media: med,
          przeznaczenie: prz,
          zabudowania: zab,
          cena: cen,
          latitude: latitude ?? undefined,
          longitude: longitude ?? undefined,
        });

        return {
          ...newListing,
          _meta: {
            fetchSuccess,
            geocoded: !!(latitude && longitude),
            isFacebook,
          },
        };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { deleteListing } = await import("./db");
        return deleteListing(input.id);
      }),

    updateNotes: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        notes: z.string().max(2000),
      }))
      .mutation(async ({ input }) => {
        const { updateListingNotes } = await import("./db");
        return updateListingNotes(input.id, input.notes);
      }),

    addRating: publicProcedure
      .input(z.object({
        listingId: z.number().int().positive(),
        score: z.number().int().min(1).max(5),
      }))
      .mutation(async ({ input }) => {
        const { addRating } = await import("./db");
        return addRating(input.listingId, input.score);
      }),

    getRatingStats: publicProcedure.query(async () => {
      const { getRatingStats } = await import("./db");
      return getRatingStats();
    }),

    /** Geocode all listings that are missing lat/lng — runs server-side where proxy works */
    geocodeMissing: publicProcedure.mutation(async () => {
      const { makeRequest } = await import("./_core/map");
      const { getDb } = await import("./db");
      const { listings } = await import("../drizzle/schema");
      const { isNull, or, eq } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const rows = await db
        .select()
        .from(listings)
        .where(or(isNull(listings.latitude), isNull(listings.longitude), eq(listings.latitude, ""), eq(listings.longitude, "")));

      let success = 0;
      let failed = 0;
      const results: { id: number; status: string; lat?: string; lng?: string }[] = [];

      for (const row of rows) {
        const locParts = [row.miejscowosc, row.gmina, row.powiat, row.wojewodztwo]
          .filter((p): p is string => !!(p && p !== "-" && p !== "brak danych" && p !== "N/A" && p.length > 1))
          .slice(0, 3);

        if (locParts.length === 0) {
          results.push({ id: row.id, status: "no_location" });
          failed++;
          continue;
        }

        const queries = [
          [...locParts, "Polska"].join(", "),
          [locParts[0], locParts[locParts.length - 1], "Polska"].join(", "),
        ];

        let geocoded = false;
        for (const geoQuery of queries) {
          try {
            const geoResult = (await makeRequest<{ results: Array<{ geometry: { location: { lat: number; lng: number } } }>, status: string }>("/maps/api/geocode/json", { address: geoQuery, language: "pl" }));
            if (geoResult?.results?.[0]?.geometry?.location) {
              const loc = geoResult.results[0].geometry.location;
              await db
                .update(listings)
                .set({ latitude: String(loc.lat), longitude: String(loc.lng) })
                .where(eq(listings.id, row.id));
              results.push({ id: row.id, status: "ok", lat: String(loc.lat), lng: String(loc.lng) });
              success++;
              geocoded = true;
              break;
            }
          } catch (e) {
            console.warn(`[geocodeMissing] Error for ID ${row.id}:`, e);
          }
        }
        if (!geocoded) {
          results.push({ id: row.id, status: "failed" });
          failed++;
        }
      }

      return { success, failed, total: rows.length, results };
    }),

    /** Update a single field on a listing (for inline editing) */
    updateField: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        field: z.enum(["wojewodztwo", "powiat", "gmina", "miejscowosc", "rozmiarDzialki", "media", "przeznaczenie", "zabudowania", "cena"]),
        value: z.string().max(500),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { listings } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        await db.update(listings).set({ [input.field]: input.value }).where(eq(listings.id, input.id));
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
