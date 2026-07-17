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
      .input(z.object({
        url: z.string().url("Podaj poprawny URL"),
        description: z.string().max(8000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { invokeLLM } = await import("./_core/llm");
        const { makeRequest } = await import("./_core/map");
        const { insertListing, getAllListings } = await import("./db");

        // ── Step 0: Duplicate detection ─────────────────────────────────────
        const allExisting = await getAllListings();
        const normalizeUrl = (u: string) => u.trim().replace(/\/$/, "").toLowerCase();
        const duplicate = allExisting.find(l => normalizeUrl(l.url) === normalizeUrl(input.url));
        if (duplicate) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `DUPLICATE:${duplicate.id}`,
          });
        }

        const isFacebook = input.url.includes("facebook.com") || input.url.includes("fb.com");
        const hasUserDescription = !!(input.description && input.description.trim().length > 30);

        // ── Step 1: Fetch page content ──────────────────────────────────────
        let pageText: string | null = null;
        let extraMeta = "";
        let fetchSuccess = false;

        if (hasUserDescription) {
          // User provided description — use it as primary content
          pageText = input.description!.trim();
          fetchSuccess = true;
        } else if (!isFacebook) {
          const html = await fetchPage(input.url);
          if (html) {
            extraMeta = extractOlxData(html);
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
        // If user provided description, build a richer prompt
        let extractionPrompt: string;
        if (hasUserDescription) {
          const FIELDS_DESC = `Zwróć TYLKO poprawny obiekt JSON z tymi polami:
{
  "wojewodztwo": "nazwa województwa małymi literami (np. 'mazowieckie') lub '-' jeśli nieznane",
  "powiat": "nazwa powiatu małymi literami lub '-'",
  "gmina": "nazwa gminy lub '-'",
  "miejscowosc": "nazwa miejscowości lub '-'",
  "rozmiarDzialki": "rozmiar działki z jednostką (np. '1500 m²', '0.5 ha') lub '-'",
  "media": "dostępne media oddzielone przecinkami lub '-'",
  "przeznaczenie": "tagi z listy: budowlana, rolna, siedliskowa, leśna, rekreacyjna, WZ, inne/brak danych",
  "zabudowania": "opis zabudowań lub '-'",
  "cena": "cena w formacie '250 000 zł' lub '-'"
}`;
          extractionPrompt = `Jesteś ekspertem od polskich ogłoszeń nieruchomości. Przeanalizuj poniższy opis ogłoszenia wklejony przez użytkownika i wyciągnij dane.\n\nURL ogłoszenia: ${input.url}\n\nOPIS OGŁOSZENIA:\n${pageText}\n\n${FIELDS_DESC}\n\nWSKAZÓWKI:\n- Szukaj ceny w formacie "XXX 000 zł" lub "XXX000 PLN"\n- Województwo zawsze małymi literami\n- Rozmiar działki: zachowaj jednostkę (m², ha, ar)\n- Przeznaczenie: szukaj słów kluczowych budowlana/rolna/siedliskowa/leśna/rekreacyjna/letniskowa/WZ`;
        } else {
          extractionPrompt = buildPrompt(input.url, pageText, extraMeta);
        }

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

        // ── Step 5b: Activity log + distance from home base (best-effort) ────
        try {
          const { logActivity, getSettingsForUser, updateListingDistance } = await import("./db");
          logActivity({
            listingId: newListing.id,
            userId: ctx.user?.id ?? null,
            userName: ctx.user?.name ?? null,
            action: "added_listing",
            detail: `Dodano ofertę #${newListing.id}: ${mie !== "-" ? mie : input.url.slice(0, 60)}`,
          }).catch(() => {});

          if (ctx.user && latitude && longitude) {
            const settings = await getSettingsForUser(ctx.user.id);
            if (settings?.homeBaseLat && settings?.homeBaseLng) {
              const dm = await makeRequest<{
                rows: Array<{ elements: Array<{ status: string; distance?: { value: number }; duration?: { value: number } }> }>;
              }>("/maps/api/distancematrix/json", {
                origins: `${settings.homeBaseLat},${settings.homeBaseLng}`,
                destinations: `${latitude},${longitude}`,
                mode: "driving",
                language: "pl",
              });
              const el = dm?.rows?.[0]?.elements?.[0];
              if (el?.status === "OK" && el.distance && el.duration) {
                await updateListingDistance(newListing.id, Math.round(el.distance.value / 100) / 10, Math.round(el.duration.value / 60));
              }
            }
          }
        } catch (err) {
          console.warn("[submitUrl] Post-insert extras failed:", err);
        }

        // ── Step 6: Detect incomplete data ──────────────────────────────────
        const KEY_FIELDS = [woj, pow, gmi, mie, roz, cen];
        const emptyCount = KEY_FIELDS.filter(f => !f || f === "-").length;
        const incompleteData = emptyCount >= 4; // 4+ key fields missing

        return {
          ...newListing,
          _meta: {
            fetchSuccess,
            geocoded: !!(latitude && longitude),
            isFacebook,
            incompleteData,
            emptyCount,
            hasUserDescription,
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
      .mutation(async ({ input, ctx }) => {
        const { updateListingNotes, logActivity } = await import("./db");
        const result = await updateListingNotes(input.id, input.notes);
        logActivity({
          listingId: input.id,
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          action: "note_updated",
          detail: `Notatka w ofercie #${input.id}`,
        }).catch(() => {});
        return result;
      }),

    addRating: publicProcedure
      .input(z.object({
        listingId: z.number().int().positive(),
        score: z.number().int().min(1).max(5),
      }))
      .mutation(async ({ input, ctx }) => {
        const { addRating, addRatingWithUser, logActivity } = await import("./db");
        const result = ctx.user
          ? await addRatingWithUser(input.listingId, input.score, ctx.user.id, ctx.user.name ?? null)
          : await addRating(input.listingId, input.score);
        logActivity({
          listingId: input.listingId,
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          action: "rated",
          detail: `Ocena ${input.score}/5 dla oferty #${input.listingId}`,
        }).catch(() => {});
        return result;
      }),

    /** Per-listing rater attribution (userName + score) for avatar display */
    getRatingRaters: publicProcedure.query(async () => {
      const { getRatingRaters } = await import("./db");
      return getRatingRaters();
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

    /** Re-extract data for an existing listing (update with new description) */
    reextractUrl: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { listings } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { invokeLLM } = await import("./_core/llm");
        const { makeRequest } = await import("./_core/map");

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

        const rows = await db.select().from(listings).where(eq(listings.id, input.id)).limit(1);
        if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
        const existing = rows[0];

        // Try fetching page content if no description provided
        let pageContent = input.description || "";
        if (!pageContent) {
          try {
            const resp = await fetch(existing.url, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36" },
              signal: AbortSignal.timeout(12000),
            });
            const html = await resp.text();
            pageContent = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
          } catch { /* use empty */ }
        }

        if (!pageContent.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Brak treści do analizy. Wklej opis ogłoszenia." });
        }

        const PRZEZNACZENIE_TAGS = ["budowlana", "rolna", "siedliskowa", "leśna", "rekreacyjna", "WZ"];
        const systemPrompt = `Jesteś ekspertem od analizy ogłoszeń nieruchomości w Polsce. Wyciągnij dane z tekstu ogłoszenia i zwróć JSON.`;
        const userPrompt = `Przeanalizuj poniższy tekst ogłoszenia i wyciągnij dane. Zwróć JSON z polami:
- wojewodztwo: nazwa województwa (np. "mazowieckie")
- powiat: nazwa powiatu
- gmina: nazwa gminy
- miejscowosc: nazwa miejscowości
- rozmiarDzialki: rozmiar działki z jednostką (np. "1500 m²", "0.5 ha")
- media: dostępne media (prąd, woda, gaz, kanalizacja, szambo itp.)
- przeznaczenie: TYLKO tagi z listy: ${PRZEZNACZENIE_TAGS.join(", ")} — możliwe kombinacje np. "budowlana, rolna"
- zabudowania: opis zabudowań (lub "brak" jeśli brak)
- cena: cena w formacie "XXX XXX zł" (lub "brak danych")

Tekst ogłoszenia:
${pageContent.slice(0, 6000)}`;

        const llmResp = await invokeLLM({
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "listing_data",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  wojewodztwo: { type: "string" }, powiat: { type: "string" }, gmina: { type: "string" },
                  miejscowosc: { type: "string" }, rozmiarDzialki: { type: "string" }, media: { type: "string" },
                  przeznaczenie: { type: "string" }, zabudowania: { type: "string" }, cena: { type: "string" },
                },
                required: ["wojewodztwo","powiat","gmina","miejscowosc","rozmiarDzialki","media","przeznaczenie","zabudowania","cena"],
                additionalProperties: false,
              },
            },
          },
        });

        const raw = JSON.parse(llmResp.choices[0].message.content as string);

        // Normalize przeznaczenie
        const rawP = (raw.przeznaczenie || "").toLowerCase();
        const tags: string[] = [];
        if (/budowl|mieszk|usług|przemys/.test(rawP)) tags.push("budowlana");
        if (/rolna|rolne|rolny|rolno/.test(rawP)) tags.push("rolna");
        if (/siedlisk/.test(rawP)) tags.push("siedliskowa");
        if (/leśn|lesn|las/.test(rawP)) tags.push("leśna");
        if (/rekreac|letnisk|wypocz|turyst/.test(rawP)) tags.push("rekreacyjna");
        if (/wz|warunki zabudowy/.test(rawP)) tags.push("WZ");
        const normalizedPrzeznaczenie = tags.length > 0 ? tags.join(", ") : "inne/brak danych";

        const updateData: Record<string, string> = {
          wojewodztwo: raw.wojewodztwo || existing.wojewodztwo || "",
          powiat: raw.powiat || existing.powiat || "",
          gmina: raw.gmina || existing.gmina || "",
          miejscowosc: raw.miejscowosc || existing.miejscowosc || "",
          rozmiarDzialki: raw.rozmiarDzialki || existing.rozmiarDzialki || "",
          media: raw.media || existing.media || "",
          przeznaczenie: normalizedPrzeznaczenie,
          zabudowania: raw.zabudowania || existing.zabudowania || "",
          cena: raw.cena || existing.cena || "",
        };

        await db.update(listings).set(updateData).where(eq(listings.id, input.id));

        // Re-geocode if location changed
        const locParts = [updateData.miejscowosc, updateData.gmina, updateData.powiat, updateData.wojewodztwo]
          .filter(p => p && p !== "-" && p !== "brak danych" && p !== "N/A" && p.length > 1)
          .slice(0, 3);
        if (locParts.length > 0) {
          try {
            const geoResult = (await makeRequest<{ results: Array<{ geometry: { location: { lat: number; lng: number } } }>, status: string }>("/maps/api/geocode/json", { address: [...locParts, "Polska"].join(", "), language: "pl" }));
            if (geoResult?.results?.[0]?.geometry?.location) {
              const loc = geoResult.results[0].geometry.location;
              await db.update(listings).set({ latitude: String(loc.lat), longitude: String(loc.lng) }).where(eq(listings.id, input.id));
            }
          } catch { /* ignore geocode errors */ }
        }

        const updated = await db.select().from(listings).where(eq(listings.id, input.id)).limit(1);
        return { success: true, listing: updated[0] };
      }),

    /** Toggle the "do kontaktu" flag on a listing (kept for backward compat; syncs `status`) */
    toggleFlag: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        flagged: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { toggleFlag, updateListingStatus, getListingById, logActivity } = await import("./db");
        const result = await toggleFlag(input.id, input.flagged);
        // Keep the status pipeline in sync with the legacy flag
        try {
          const listing = await getListingById(input.id);
          if (input.flagged) {
            await updateListingStatus(input.id, "do_kontaktu");
          } else if (listing && listing.status === "do_kontaktu") {
            await updateListingStatus(input.id, "nowy");
          }
        } catch { /* best-effort sync */ }
        logActivity({
          listingId: input.id,
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          action: "status_change",
          detail: input.flagged ? `Oferta #${input.id} → Do kontaktu` : `Oferta #${input.id} → Nowy`,
        }).catch(() => {});
        return result;
      }),

    /** Update the status pipeline value (nowy | do_kontaktu | obejrzany | odrzucony | oferta_zlozona) */
    updateStatus: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        status: z.enum(["nowy", "do_kontaktu", "obejrzany", "odrzucony", "oferta_zlozona"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateListingStatus, logActivity, notifyAllUsers } = await import("./db");
        const { LISTING_STATUSES } = await import("@shared/types");
        const result = await updateListingStatus(input.id, input.status);
        const label = LISTING_STATUSES.find(s => s.key === input.status)?.label ?? input.status;
        logActivity({
          listingId: input.id,
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          action: "status_change",
          detail: `Oferta #${input.id} → ${label}`,
        }).catch(() => {});
        // Notify family about meaningful pipeline moves (not every click)
        if (input.status === "oferta_zlozona" || input.status === "obejrzany") {
          notifyAllUsers({
            listingId: input.id,
            type: "status_change",
            title: `Oferta #${input.id}: ${label}`,
            body: ctx.user?.name ? `Zmienione przez: ${ctx.user.name}` : null,
          }).catch(() => {});
        }
        return result;
      }),

    /** Update structured pros/cons lists */
    updateProsCons: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        pros: z.string().max(2000).nullable(),
        cons: z.string().max(2000).nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateListingProsCons, logActivity } = await import("./db");
        const result = await updateListingProsCons(input.id, input.pros, input.cons);
        logActivity({
          listingId: input.id,
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          action: "pros_cons_updated",
          detail: `Plusy/minusy w ofercie #${input.id}`,
        }).catch(() => {});
        return result;
      }),

    /** Archive a listing (hide from map, move to archived section) */
    archiveListing: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { archiveListing, logActivity } = await import("./db");
        const result = await archiveListing(input.id);
        logActivity({
          listingId: input.id,
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          action: "archived",
          detail: `Zarchiwizowano ofertę #${input.id}`,
        }).catch(() => {});
        return result;
      }),

    /** Restore an archived listing */
    unarchiveListing: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { unarchiveListing } = await import("./db");
        return unarchiveListing(input.id);
      }),

    /**
     * Check activity of all (or a subset of) listing URLs.
     * For each URL: fetch the page, then ask AI if the listing is still active.
     * Returns an array of { id, url, active, reason }.
     * Runs checks in parallel batches to avoid timeout.
     */
    checkUrls: publicProcedure
      .input(z.object({
        ids: z.array(z.number().int().positive()).optional(), // if omitted, check all non-archived
      }))
      .mutation(async ({ input, ctx }) => {
        const { getAllListings, recordPrice, updateListingPrice, notifyAllUsers, logActivity } = await import("./db");
        const { invokeLLM } = await import("./_core/llm");

        const all = await getAllListings();
        const toCheck = input.ids
          ? all.filter(l => input.ids!.includes(l.id) && !l.archived)
          : all.filter(l => !l.archived);

        type CheckResult = { id: number; url: string; active: boolean; reason: string; priceChanged?: boolean; oldPrice?: string; newPrice?: string };

        /** Parse Polish price string to number, e.g. "350 000 zł" → 350000 */
        function parsePrice(raw: string | null | undefined): number | null {
          if (!raw || raw === "-") return null;
          const digits = raw.replace(/[^\d]/g, "");
          if (!digits) return null;
          const n = parseInt(digits, 10);
          return isNaN(n) || n < 1000 ? null : n;
        }

        async function checkOne(listing: { id: number; url: string; cena: string }): Promise<CheckResult> {
          try {
            // Fetch the page
            const resp = await fetch(listing.url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "pl-PL,pl;q=0.9",
              },
              signal: AbortSignal.timeout(15000),
              redirect: "follow",
            });

            if (!resp.ok) {
              // HTTP 404 or similar — definitely inactive
              return { id: listing.id, url: listing.url, active: false, reason: `HTTP ${resp.status} — strona nie istnieje` };
            }

            const html = await resp.text();
            const text = html
              .replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 4000);

            // Ask AI to determine if the listing is still active + extract current price
            const aiResp = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: "Jesteś asystentem sprawdzającym aktywność ogłoszeń nieruchomości. Odpowiadasz TYLKO w JSON.",
                },
                {
                  role: "user",
                  content: `Sprawdź czy poniższe ogłoszenie nieruchomości jest nadal aktywne oraz odczytaj aktualną cenę.\n\nURL: ${listing.url}\n\nTREŚĆ STRONY (fragment):\n${text}\n\nZwróć JSON: { "active": true/false, "reason": "krótkie wyjaśnienie po polsku", "currentPrice": "aktualna cena w formacie 'XXX XXX zł' lub '-' jeśli nie można odczytać" }\n\nOGŁOSZENIE JEST NIEAKTYWNE jeśli:\n- Strona zawiera komunikat o usunięciu/wygaśnięciu ogłoszenia (np. "To ogłoszenie jest nieaktywne", "Ogłoszenie wygasło", "Oferta niedostępna", "Nie znaleziono ogłoszenia")\n- Strona przekierowuje do strony głównej lub listy ogłoszeń bez treści\n- Brak jakichkolwiek danych o nieruchomości\n\nOGŁOSZENIE JEST AKTYWNE jeśli:\n- Zawiera opis nieruchomości, cenę, lokalizację\n- Nie ma komunikatów o wygaśnięciu`,
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "activity_check",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      active: { type: "boolean" },
                      reason: { type: "string" },
                      currentPrice: { type: "string" },
                    },
                    required: ["active", "reason", "currentPrice"],
                    additionalProperties: false,
                  },
                },
              },
            });

            const result = JSON.parse(aiResp.choices[0].message.content as string) as { active: boolean; reason: string; currentPrice?: string };

            // ── Price change detection ──
            let priceChanged = false;
            let oldPrice: string | undefined;
            let newPrice: string | undefined;
            if (result.active && result.currentPrice && result.currentPrice !== "-") {
              const oldNum = parsePrice(listing.cena);
              const newNum = parsePrice(result.currentPrice);
              if (oldNum !== null && newNum !== null && oldNum !== newNum) {
                priceChanged = true;
                oldPrice = listing.cena;
                newPrice = normalizePrice(result.currentPrice);
                try {
                  await recordPrice(listing.id, oldPrice);
                  await recordPrice(listing.id, newPrice);
                  await updateListingPrice(listing.id, newPrice);
                  const drop = newNum < oldNum;
                  await notifyAllUsers({
                    listingId: listing.id,
                    type: drop ? "price_drop" : "price_increase",
                    title: drop
                      ? `Cena spadła: oferta #${listing.id}`
                      : `Cena wzrosła: oferta #${listing.id}`,
                    body: `${oldPrice} → ${newPrice}`,
                  });
                  await logActivity({
                    listingId: listing.id,
                    userId: null,
                    userName: "System",
                    action: "price_change",
                    detail: `Oferta #${listing.id}: ${oldPrice} → ${newPrice}`,
                  });
                } catch (err) {
                  console.warn(`[checkUrls] Price change persistence failed for #${listing.id}:`, err);
                }
              }
            }

            // ── Expired listing notification ──
            if (!result.active) {
              notifyAllUsers({
                listingId: listing.id,
                type: "listing_expired",
                title: `Ogłoszenie wygasło: oferta #${listing.id}`,
                body: result.reason?.slice(0, 500) ?? null,
              }).catch(() => {});
            }

            return { id: listing.id, url: listing.url, active: result.active, reason: result.reason, priceChanged, oldPrice, newPrice };
          } catch (err) {
            console.warn(`[checkUrls] Error for ID ${listing.id}:`, err);
            return { id: listing.id, url: listing.url, active: true, reason: "Nie udało się sprawdzić (błąd sieci)" };
          }
        }

        // Process in batches of 5 to avoid overwhelming the server
        const BATCH = 5;
        const results: CheckResult[] = [];
        for (let i = 0; i < toCheck.length; i += BATCH) {
          const batch = toCheck.slice(i, i + BATCH);
          const batchResults = await Promise.all(batch.map(l => checkOne(l)));
          results.push(...batchResults);
        }

        return results;
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

  // ── Threaded notes ────────────────────────────────────────────────────────────────
  notes: router({
    getAll: publicProcedure.query(async () => {
      const { getNotesForListings } = await import("./db");
      return getNotesForListings();
    }),

    add: publicProcedure
      .input(z.object({
        listingId: z.number().int().positive(),
        parentId: z.number().int().positive().nullable().optional(),
        content: z.string().min(1).max(2000),
      }))
      .mutation(async ({ input, ctx }) => {
        const { addNote, logActivity } = await import("./db");
        const result = await addNote({
          listingId: input.listingId,
          parentId: input.parentId ?? null,
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          content: input.content,
        });
        logActivity({
          listingId: input.listingId,
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          action: input.parentId ? "note_reply" : "note_added",
          detail: `${input.parentId ? "Odpowiedź" : "Notatka"} w ofercie #${input.listingId}: ${input.content.slice(0, 80)}`,
        }).catch(() => {});
        return result;
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { deleteNote } = await import("./db");
        return deleteNote(input.id);
      }),
  }),

  // ── Tags ──────────────────────────────────────────────────────────────────────────
  tags: router({
    getAll: publicProcedure.query(async () => {
      const { getAllTags } = await import("./db");
      return getAllTags();
    }),

    getAssignments: publicProcedure.query(async () => {
      const { getListingTagMap } = await import("./db");
      return getListingTagMap();
    }),

    create: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(64),
        color: z.string().max(24).default("blue"),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createTag, logActivity } = await import("./db");
        const tag = await createTag(input.name, input.color);
        logActivity({
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          action: "tag_created",
          detail: `Nowy tag: ${input.name}`,
        }).catch(() => {});
        return tag;
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(64),
        color: z.string().max(24),
      }))
      .mutation(async ({ input }) => {
        const { updateTag } = await import("./db");
        return updateTag(input.id, input.name, input.color);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { deleteTag } = await import("./db");
        return deleteTag(input.id);
      }),

    assign: publicProcedure
      .input(z.object({
        listingId: z.number().int().positive(),
        tagId: z.number().int().positive(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { assignTag, logActivity } = await import("./db");
        const result = await assignTag(input.listingId, input.tagId);
        logActivity({
          listingId: input.listingId,
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          action: "tagged",
          detail: `Tag dodany do oferty #${input.listingId}`,
        }).catch(() => {});
        return result;
      }),

    unassign: publicProcedure
      .input(z.object({
        listingId: z.number().int().positive(),
        tagId: z.number().int().positive(),
      }))
      .mutation(async ({ input }) => {
        const { unassignTag } = await import("./db");
        return unassignTag(input.listingId, input.tagId);
      }),
  }),

  // ── Activity log ────────────────────────────────────────────────────────────────
  activity: router({
    getRecent: publicProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional())
      .query(async ({ input }) => {
        const { getActivityLog } = await import("./db");
        return getActivityLog(input?.limit ?? 100);
      }),
  }),

  // ── Notifications ──────────────────────────────────────────────────────────────
  notifications: router({
    getMine: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return [];
      const { getNotificationsForUser } = await import("./db");
      return getNotificationsForUser(ctx.user.id);
    }),

    unreadCount: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return 0;
      const { getUnreadCount } = await import("./db");
      return getUnreadCount(ctx.user.id);
    }),

    markRead: publicProcedure
      .input(z.object({ ids: z.array(z.number().int().positive()).optional() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) return { success: false };
        const { markNotificationsRead } = await import("./db");
        return markNotificationsRead(ctx.user.id, input.ids);
      }),
  }),

  // ── Settings (home base + distance computation) ─────────────────────────
  settings: router({
    get: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      const { getSettingsForUser } = await import("./db");
      return (await getSettingsForUser(ctx.user.id)) ?? null;
    }),

    /** Save home base and recompute driving distances for all listings */
    setHomeBase: publicProcedure
      .input(z.object({
        label: z.string().max(256),
        lat: z.number().min(-90).max(90).nullable(),
        lng: z.number().min(-180).max(180).nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Zaloguj się, aby zapisać ustawienia" });
        const { upsertSettings, getAllListings, updateListingDistance, logActivity } = await import("./db");
        const { makeRequest } = await import("./_core/map");

        // Geocode label if no explicit coordinates given
        let lat = input.lat;
        let lng = input.lng;
        if ((lat === null || lng === null) && input.label.trim()) {
          try {
            const geo = await makeRequest<{ results: Array<{ geometry: { location: { lat: number; lng: number } } }> }>(
              "/maps/api/geocode/json",
              { address: `${input.label}, Polska`, language: "pl" }
            );
            const loc = geo?.results?.[0]?.geometry?.location;
            if (loc) { lat = loc.lat; lng = loc.lng; }
          } catch { /* geocode failed */ }
        }

        if (lat === null || lng === null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nie udało się znaleźć lokalizacji. Podaj dokładniejszy adres." });
        }

        await upsertSettings(ctx.user.id, {
          homeBaseLabel: input.label,
          homeBaseLat: String(lat),
          homeBaseLng: String(lng),
        });

        // Recompute driving distances for all listings with coordinates (batches of 25)
        const all = await getAllListings();
        const withCoords = all.filter(l => l.latitude && l.longitude);
        let computed = 0;
        const BATCH = 25;
        for (let i = 0; i < withCoords.length; i += BATCH) {
          const batch = withCoords.slice(i, i + BATCH);
          try {
            const destinations = batch.map(l => `${l.latitude},${l.longitude}`).join("|");
            const dm = await makeRequest<{
              rows: Array<{ elements: Array<{ status: string; distance?: { value: number }; duration?: { value: number } }> }>;
            }>("/maps/api/distancematrix/json", {
              origins: `${lat},${lng}`,
              destinations,
              mode: "driving",
              language: "pl",
            });
            const elements = dm?.rows?.[0]?.elements ?? [];
            for (let j = 0; j < batch.length; j++) {
              const el = elements[j];
              if (el?.status === "OK" && el.distance && el.duration) {
                await updateListingDistance(batch[j].id, Math.round(el.distance.value / 100) / 10, Math.round(el.duration.value / 60));
                computed++;
              }
            }
          } catch (err) {
            console.warn("[setHomeBase] Distance matrix batch failed:", err);
          }
        }

        logActivity({
          userId: ctx.user.id,
          userName: ctx.user.name ?? null,
          action: "home_base_set",
          detail: `Punkt odniesienia: ${input.label} (${computed} dystansów)`,
        }).catch(() => {});

        return { success: true, lat, lng, computed, total: withCoords.length };
      }),
  }),

  // ── Weighted scoring ──────────────────────────────────────────────────────────
  scoring: router({
    getCriteria: publicProcedure.query(async () => {
      const { getCriteria } = await import("./db");
      return getCriteria();
    }),

    createCriterion: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(64),
        weight: z.number().int().min(1).max(10).default(5),
      }))
      .mutation(async ({ input }) => {
        const { createCriterion } = await import("./db");
        return createCriterion(input.name, input.weight);
      }),

    updateCriterion: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(64).optional(),
        weight: z.number().int().min(1).max(10).optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateCriterion } = await import("./db");
        return updateCriterion(input.id, { name: input.name, weight: input.weight });
      }),

    deleteCriterion: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { deleteCriterion } = await import("./db");
        return deleteCriterion(input.id);
      }),

    getScores: publicProcedure.query(async () => {
      const { getAllCriterionRatings } = await import("./db");
      const rows = await getAllCriterionRatings();
      // listingId → { criterionId → score }
      const map: Record<number, Record<number, number>> = {};
      for (const r of rows) {
        if (!map[r.listingId]) map[r.listingId] = {};
        map[r.listingId][r.criterionId] = r.score;
      }
      return map;
    }),

    setScore: publicProcedure
      .input(z.object({
        listingId: z.number().int().positive(),
        criterionId: z.number().int().positive(),
        score: z.number().int().min(1).max(5),
      }))
      .mutation(async ({ input }) => {
        const { setCriterionScore } = await import("./db");
        return setCriterionScore(input.listingId, input.criterionId, input.score);
      }),
  }),

  // ── Areas of interest (map polygons) ─────────────────────────────────────
  areas: router({
    getAll: publicProcedure.query(async () => {
      const { getAreas } = await import("./db");
      return getAreas();
    }),

    create: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(128).default("Obszar"),
        color: z.string().max(24).default("blue"),
        path: z.string().min(2).max(60000), // JSON [{lat,lng},...]
      }))
      .mutation(async ({ input, ctx }) => {
        const { createArea, logActivity } = await import("./db");
        const area = await createArea(input.name, input.color, input.path);
        logActivity({
          userId: ctx.user?.id ?? null,
          userName: ctx.user?.name ?? null,
          action: "area_created",
          detail: `Nowy obszar na mapie: ${input.name}`,
        }).catch(() => {});
        return area;
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(128).optional(),
        color: z.string().max(24).optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateArea } = await import("./db");
        return updateArea(input.id, { name: input.name, color: input.color });
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { deleteArea } = await import("./db");
        return deleteArea(input.id);
      }),
  }),

  // ── Insights (price history) ─────────────────────────────────────────────
  insights: router({
    getPriceHistory: publicProcedure.query(async () => {
      const { getPriceHistory } = await import("./db");
      return getPriceHistory();
    }),
  }),
});

export type AppRouter = typeof appRouter;
