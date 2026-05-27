/**
 * Fix the 6 new listings (IDs 53-59):
 * 1. Remove duplicate entries (58 & 59 are duplicates of each other)
 * 2. Re-fetch and re-extract data for all problematic entries
 * 3. Geocode all entries that are missing lat/lng
 */

import mysql from "mysql2/promise";
import { readFileSync } from "fs";
// Node 22 has built-in fetch

// Load env
const envPath = "/home/ubuntu/nieruchomosci-tracker/.env";
let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  try {
    const envContent = readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const [k, ...v] = line.split("=");
      if (k?.trim() === "DATABASE_URL") DATABASE_URL = v.join("=").trim();
    }
  } catch {}
}

const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL || "https://api.manus.im";
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

async function invokeLLM(messages, responseFormat) {
  const body = { messages, model: "claude-sonnet-4-5" };
  if (responseFormat) body.response_format = responseFormat;
  const resp = await fetch(`${FORGE_API_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FORGE_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`LLM error: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function geocode(address, conn) {
  // Use Google Maps via Manus proxy
  const mapsUrl = process.env.BUILT_IN_FORGE_API_URL?.replace("/v1", "") || "https://api.manus.im";
  try {
    const resp = await fetch(`${mapsUrl}/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=pl`, {
      headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data?.results?.[0]?.geometry?.location) {
      return data.results[0].geometry.location;
    }
  } catch (e) {
    console.warn("Geocode error:", e.message);
  }
  return null;
}

async function fetchPage(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "pl-PL,pl;q=0.9",
      },
      timeout: 20000,
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    return html.length > 200 ? html : null;
  } catch {
    return null;
  }
}

function stripHtml(html, maxLen = 10000) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function normalizePrice(raw) {
  if (!raw || raw === "-" || raw.toLowerCase().includes("brak") || raw === "N/A") return "-";
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "-";
  const num = parseInt(digits, 10);
  if (isNaN(num) || num < 1000) return "-";
  const formatted = num.toLocaleString("pl-PL").replace(/,/g, " ");
  return `${formatted} zł`;
}

function normLoc(val) {
  if (!val) return "-";
  const v = val.trim();
  if (["brak danych", "n/a", "brak", "nieznane", "unknown", "null", "none", "-"].includes(v.toLowerCase())) return "-";
  return v;
}

function normalizePrzeznaczenie(raw) {
  if (!raw || raw === "-") return "inne/brak danych";
  const r = raw.toLowerCase().trim();
  const tags = [];
  if (r.includes("budowlana") || r.includes("budowl") || r.includes("mieszkaniowa") || r.includes("usługowa")) tags.push("budowlana");
  if (r.includes("siedlisk") || r.includes("zagroda")) tags.push("siedliskowa");
  if (r.includes("leśna") || r.includes("lesna") || r.includes(" las")) tags.push("leśna");
  if (r.includes("rekre") || r.includes("letnisk") || r.includes("wypocz") || r.includes("turyst")) tags.push("rekreacyjna");
  if (r.includes("rolna") || r.includes("rolno") || r.includes("rolnicza")) tags.push("rolna");
  if (r.includes(" wz") || r === "wz" || r.includes("warunki zabudowy")) tags.push("WZ");
  if (tags.length === 0) return "inne/brak danych";
  return [...new Set(tags)].join(", ");
}

const EXTRACTION_SCHEMA = {
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
};

async function extractFromUrl(url) {
  const isFacebook = url.includes("facebook.com");
  let pageText = null;
  let extraMeta = "";

  if (!isFacebook) {
    const html = await fetchPage(url);
    if (html) {
      // Extract meta tags
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
      const priceMatch = html.match(/"price":\s*\{[^}]*"value":\s*"?(\d[\d\s]*)"?/);
      const cityMatch = html.match(/"city":\s*"([^"]+)"/);
      if (titleMatch) extraMeta += `Tytuł: ${titleMatch[1]}\n`;
      if (descMatch) extraMeta += `Opis: ${descMatch[1]}\n`;
      if (priceMatch) extraMeta += `Cena (JSON): ${priceMatch[1]} zł\n`;
      if (cityMatch) extraMeta += `Miasto (JSON): ${cityMatch[1]}\n`;
      pageText = stripHtml(html, 10000);
      if (pageText.length < 200) pageText = null;
    }
  } else {
    const html = await fetchPage(url);
    if (html) {
      const ogTitle = html.match(/property="og:title"[^>]+content="([^"]+)"/i);
      const ogDesc = html.match(/property="og:description"[^>]+content="([^"]+)"/i);
      if (ogTitle) extraMeta += `OG Title: ${ogTitle[1]}\n`;
      if (ogDesc) extraMeta += `OG Opis: ${ogDesc[1]}\n`;
    }
  }

  const prompt = pageText
    ? `Jesteś ekspertem od polskich ogłoszeń nieruchomości. Przeanalizuj poniższy tekst ze strony ogłoszenia.

URL: ${url}
${extraMeta ? `\nMETADANE:\n${extraMeta}` : ""}
TREŚĆ:
${pageText}

Zwróć JSON z polami: wojewodztwo (małe litery), powiat (małe litery), gmina, miejscowosc, rozmiarDzialki (z jednostką), media (przecinkami), przeznaczenie (tagi: budowlana/rolna/siedliskowa/leśna/rekreacyjna/WZ/inne/brak danych), zabudowania, cena (format "250 000 zł").
Użyj '-' dla nieznanych pól.`
    : `Przeanalizuj URL ogłoszenia nieruchomości.
URL: ${url}
${extraMeta ? `\nMetadane:\n${extraMeta}` : ""}
Zwróć JSON: wojewodztwo, powiat, gmina, miejscowosc, rozmiarDzialki, media, przeznaczenie (tagi: budowlana/rolna/siedliskowa/leśna/rekreacyjna/WZ/inne/brak danych), zabudowania, cena.
Użyj '-' dla nieznanych.`;

  const aiResp = await invokeLLM(
    [
      { role: "system", content: "Precyzyjny ekstraher danych z polskich ogłoszeń. Zwracaj TYLKO JSON." },
      { role: "user", content: prompt },
    ],
    EXTRACTION_SCHEMA
  );

  const raw = aiResp.choices[0]?.message?.content || "{}";
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log("Connected to DB");

  // 1. Check for duplicates — ID 58 and 59 have the same URL
  const [dupes] = await conn.execute(
    "SELECT id, url FROM listings WHERE id IN (53,54,55,56,57,58,59) ORDER BY id"
  );
  console.log("\nListings to fix:");
  dupes.forEach(r => console.log(`  ID ${r.id}: ${r.url.substring(0, 80)}`));

  // 2. Delete the higher-ID duplicate (59 is duplicate of 58)
  const urlCounts = {};
  for (const r of dupes) {
    if (!urlCounts[r.url]) urlCounts[r.url] = [];
    urlCounts[r.url].push(r.id);
  }
  for (const [url, ids] of Object.entries(urlCounts)) {
    if (ids.length > 1) {
      // Keep lowest ID, delete the rest
      const toDelete = ids.slice(1);
      console.log(`\nDuplicate URL found. Keeping ID ${ids[0]}, deleting IDs: ${toDelete.join(", ")}`);
      await conn.execute(`DELETE FROM listings WHERE id IN (${toDelete.join(",")})`, []);
    }
  }

  // 3. Get remaining listings that need fixing (missing data or geocoding)
  const [toFix] = await conn.execute(
    `SELECT id, url, wojewodztwo, powiat, gmina, miejscowosc, rozmiarDzialki, media, przeznaczenie, zabudowania, cena, latitude, longitude 
     FROM listings WHERE id >= 53 ORDER BY id`
  );

  console.log(`\nFixing ${toFix.length} listings...`);

  for (const listing of toFix) {
    console.log(`\n--- Processing ID ${listing.id}: ${listing.url.substring(0, 70)} ---`);

    const needsExtraction =
      listing.wojewodztwo === "-" ||
      listing.miejscowosc === "-" ||
      listing.cena === "-" ||
      listing.wojewodztwo === "brak danych" ||
      listing.miejscowosc === "brak danych" ||
      listing.cena === "brak danych" ||
      listing.wojewodztwo === "N/A";

    let extracted = null;
    if (needsExtraction) {
      console.log("  → Re-extracting data...");
      try {
        extracted = await extractFromUrl(listing.url);
        console.log("  → Extracted:", JSON.stringify(extracted));
      } catch (e) {
        console.error("  → Extraction failed:", e.message);
      }
    } else {
      console.log("  → Data looks OK, only geocoding needed");
    }

    // Use extracted data or existing data
    const woj = normLoc(extracted?.wojewodztwo || listing.wojewodztwo).toLowerCase();
    const pow = normLoc(extracted?.powiat || listing.powiat).toLowerCase();
    const gmi = normLoc(extracted?.gmina || listing.gmina);
    const mie = normLoc(extracted?.miejscowosc || listing.miejscowosc);
    const roz = normLoc(extracted?.rozmiarDzialki || listing.rozmiarDzialki);
    const med = normLoc(extracted?.media || listing.media);
    const zab = normLoc(extracted?.zabudowania || listing.zabudowania);
    const cen = normalizePrice(extracted?.cena || listing.cena);
    const prz = normalizePrzeznaczenie(extracted?.przeznaczenie || listing.przeznaczenie);

    // Geocode if missing
    let lat = listing.latitude;
    let lng = listing.longitude;
    if (!lat || !lng) {
      const locParts = [mie, gmi, pow, woj].filter(p => p && p !== "-" && p.length > 1).slice(0, 3);
      if (locParts.length >= 1) {
        const geoQuery = [...locParts, "Polska"].join(", ");
        console.log(`  → Geocoding: "${geoQuery}"`);
        const loc = await geocode(geoQuery, conn);
        if (loc) {
          lat = String(loc.lat);
          lng = String(loc.lng);
          console.log(`  → Geocoded: ${lat}, ${lng}`);
        } else {
          console.warn("  → Geocoding failed");
        }
      } else {
        console.warn("  → No location data for geocoding");
      }
    }

    // Update the listing
    await conn.execute(
      `UPDATE listings SET 
        wojewodztwo = ?, powiat = ?, gmina = ?, miejscowosc = ?,
        rozmiarDzialki = ?, media = ?, przeznaczenie = ?, zabudowania = ?,
        cena = ?, latitude = ?, longitude = ?, updatedAt = NOW()
       WHERE id = ?`,
      [woj, pow, gmi, mie, roz, med, prz, zab, cen, lat, lng, listing.id]
    );
    console.log(`  → Updated ID ${listing.id}: ${mie}, ${woj} | ${cen} | lat=${lat}`);
  }

  // Final check
  const [final] = await conn.execute(
    "SELECT id, miejscowosc, wojewodztwo, cena, przeznaczenie, latitude FROM listings WHERE id >= 53 ORDER BY id"
  );
  console.log("\n=== Final state of fixed listings ===");
  final.forEach(r => {
    console.log(`  ID ${r.id}: ${r.miejscowosc}, ${r.wojewodztwo} | ${r.cena} | ${r.przeznaczenie} | lat=${r.latitude || "MISSING"}`);
  });

  await conn.end();
  console.log("\nDone!");
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
