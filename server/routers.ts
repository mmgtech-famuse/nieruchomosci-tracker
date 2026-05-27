import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

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

        // ── Step 1: Fetch page content ──────────────────────────────────────
        let pageContent = "";
        let fetchSuccess = false;
        try {
          const resp = await fetch(input.url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
              "Accept-Encoding": "gzip, deflate, br",
              "Cache-Control": "no-cache",
            },
            signal: AbortSignal.timeout(15000),
          });
          if (resp.ok) {
            const html = await resp.text();
            // Strip scripts, styles, and HTML tags — keep text content
            pageContent = html
              .replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 8000);
            fetchSuccess = pageContent.length > 100;
          }
        } catch (fetchErr) {
          console.warn("[Fetch] Failed to fetch listing page:", fetchErr);
        }

        // ── Step 2: AI extraction ───────────────────────────────────────────
        const extractionPrompt = fetchSuccess
          ? `Jesteś ekspertem od polskich ogłoszeń nieruchomości. Przeanalizuj poniższy tekst ze strony ogłoszenia i wyciągnij dane.

URL: ${input.url}
TREŚĆ STRONY:
${pageContent}

Zwróć TYLKO poprawny obiekt JSON z tymi polami:
{
  "wojewodztwo": "nazwa województwa małymi literami (np. 'mazowieckie') lub '-' jeśli nieznane",
  "powiat": "nazwa powiatu lub '-'",
  "gmina": "nazwa gminy lub '-'",
  "miejscowosc": "nazwa miejscowości lub '-'",
  "rozmiarDzialki": "rozmiar działki z jednostką (np. '1500 m²', '0.5 ha') lub '-'",
  "media": "dostępne media oddzielone przecinkami (np. 'prąd, woda, gaz') lub '-'",
  "przeznaczenie": "Podaj przeznaczenie działki jako LISTĘ TAGÓW oddzielonych przecinkiem. Używaj WYŁĄCZNIE tych tagów (możesz łączyć kilka):\n- budowlana (B): przeznaczona pod zabudowę mieszkaniową, usługową lub przemysłową\n- rolna (R): działalność rolnicza, wymaga odrolnienia przed budową\n- siedliskowa (S): część działki rolnej pod zabudowę zagrodową dla rolnika\n- leśna (L): pokryta lasem lub przeznaczona na cele leśne\n- rekreacyjna: wypoczynek, letniskowa, turystyczna\n- WZ: działka z wydanymi warunkami zabudowy\n- inne/brak danych: gdy brak informacji lub nie pasuje do żadnej kategorii\n\nPrzykłady:\n- działka rolna z WZ → 'rolna, WZ'\n- rolno-budowlana → 'rolna, budowlana'\n- siedliskowa z lasem → 'siedliskowa, leśna'\n- brak info → 'inne/brak danych'",
  "zabudowania": "opis zabudowań lub '-'",
  "cena": "cena w formacie '250 000 zł' lub '-' jeśli brak"
}`
          : `Przeanalizuj URL ogłoszenia nieruchomości i wyciągnij co możesz z samego linku.
URL: ${input.url}
Zwróć obiekt JSON z polami: wojewodztwo, powiat, gmina, miejscowosc, rozmiarDzialki, media, przeznaczenie, zabudowania, cena.
Dla pola przeznaczenie użyj tagów oddzielonych przecinkiem spośród: budowlana, rolna, siedliskowa, leśna, rekreacyjna, WZ, inne/brak danych. Możesz łączyć kilka (np. "rolna, WZ").
Dla pozostałych pól użyj '-' jeśli nie możesz określić.`;

        let extracted: Record<string, string> = {};
        try {
          const aiResponse = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "Jesteś precyzyjnym ekstraherem danych z polskich ogłoszeń nieruchomości. Zawsze zwracaj TYLKO poprawny JSON bez żadnego dodatkowego tekstu.",
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
                  required: [
                    "wojewodztwo",
                    "powiat",
                    "gmina",
                    "miejscowosc",
                    "rozmiarDzialki",
                    "media",
                    "przeznaczenie",
                    "zabudowania",
                    "cena",
                  ],
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

        // ── Step 3: Geocoding ───────────────────────────────────────────────
        let latitude: string | null = null;
        let longitude: string | null = null;
        const locationParts = [
          extracted.miejscowosc,
          extracted.gmina,
          extracted.powiat,
          extracted.wojewodztwo,
          "Polska",
        ].filter(p => p && p !== "-");

        if (locationParts.length > 1) {
          try {
            const geoResult = (await makeRequest("geocode", {
              address: locationParts.join(", "),
            })) as any;
            if (geoResult?.results?.[0]?.geometry?.location) {
              const loc = geoResult.results[0].geometry.location;
              latitude = String(loc.lat);
              longitude = String(loc.lng);
            }
          } catch (geoErr) {
            console.warn("[Geocoding] Failed:", geoErr);
            // Geocoding failure is non-fatal — listing saved without coordinates
          }
        }

        // ── Step 3b: Normalize przeznaczenie to legal Polish land categories ──────────
        // Allowed tags: budowlana, rolna, siedliskowa, leśna, rekreacyjna, WZ, inne/brak danych
        // Multi-value allowed (comma-separated), e.g. "rolna, WZ" or "rolna, budowlana"
        const LEGAL_TAGS = ['budowlana', 'rolna', 'siedliskowa', 'leśna', 'rekreacyjna', 'WZ', 'inne/brak danych'];
        const rawP = (extracted.przeznaczenie || '').toLowerCase().trim();
        const normalizePrzeznaczenie = (raw: string): string => {
          if (!raw || raw === '-') return 'inne/brak danych';
          const tags: string[] = [];
          // Check for budowlana (includes mieszkaniowa MN, usługowa, turystyczna)
          if (raw.includes('budowlana') || raw.includes('budowl') || raw.includes('mieszkaniowa') || raw.includes('usługowa') || raw.includes('przemysłowa') || raw.includes('turyst')) tags.push('budowlana');
          // Check for siedliskowa
          if (raw.includes('siedlisk') || raw.includes('zagroda') || raw.includes('zagrodowa')) tags.push('siedliskowa');
          // Check for leśna
          if (raw.includes('leśna') || raw.includes('lesna') || raw.includes('las')) tags.push('leśna');
          // Check for rekreacyjna
          if (raw.includes('rekre') || raw.includes('letnisk') || raw.includes('wypocz')) tags.push('rekreacyjna');
          // Check for rolna (after siedliskowa/leśna to avoid double-counting)
          if (raw.includes('rolna') || raw.includes('rolno') || raw.includes('rolnicza')) tags.push('rolna');
          // Check for WZ (warunki zabudowy) — always appended last as supplementary tag
          if (raw.includes('wz') || raw.includes('warunki zabudowy') || raw.includes('warunki')) tags.push('WZ');
          // If nothing matched → inne/brak danych
          if (tags.length === 0) return 'inne/brak danych';
          // Deduplicate and join
          return Array.from(new Set(tags)).join(', ');
        };
        const normP = normalizePrzeznaczenie(rawP);

        // ── Step 4: Save to DB ──────────────────────────────────────────────
        const newListing = await insertListing({
          url: input.url,
          wojewodztwo: extracted.wojewodztwo || "-",
          powiat: extracted.powiat || "-",
          gmina: extracted.gmina || "-",
          miejscowosc: extracted.miejscowosc || "-",
          rozmiarDzialki: extracted.rozmiarDzialki || "-",
          media: extracted.media || "-",
          przeznaczenie: normP,
          zabudowania: extracted.zabudowania || "-",
          cena: extracted.cena || "-",
          latitude: latitude ?? undefined,
          longitude: longitude ?? undefined,
        });

        return {
          ...newListing,
          _meta: {
            fetchSuccess,
            geocoded: !!(latitude && longitude),
          },
        };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { deleteListing } = await import("./db");
        return deleteListing(input.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
