/**
 * Geocode all listings that are missing lat/lng coordinates
 * Uses the same Manus proxy as the server
 */

import mysql from "mysql2/promise";
import { readFileSync } from "fs";

// Load .env
const envPath = "/home/ubuntu/nieruchomosci-tracker/.env";
const envVars = {};
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      envVars[k] = v;
    }
  }
} catch {}

const DATABASE_URL = process.env.DATABASE_URL || envVars.DATABASE_URL;
const FORGE_API_URL = (process.env.BUILT_IN_FORGE_API_URL || envVars.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY || envVars.BUILT_IN_FORGE_API_KEY;

console.log("FORGE_API_URL:", FORGE_API_URL ? FORGE_API_URL.substring(0, 40) + "..." : "MISSING");
console.log("FORGE_API_KEY:", FORGE_API_KEY ? "SET" : "MISSING");

async function geocodeAddress(address) {
  // Use the Manus proxy endpoint: /v1/maps/proxy/maps/api/geocode/json
  const url = new URL(`${FORGE_API_URL}/v1/maps/proxy/maps/api/geocode/json`);
  url.searchParams.set("address", address);
  url.searchParams.set("language", "pl");

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${FORGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Geocode HTTP ${resp.status}: ${text.substring(0, 200)}`);
  }

  const data = await resp.json();
  if (data?.results?.[0]?.geometry?.location) {
    return data.results[0].geometry.location;
  }
  console.warn(`  No results for: "${address}" — status: ${data?.status}`);
  return null;
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log("Connected to DB\n");

  // Get all listings missing coordinates
  const [rows] = await conn.execute(
    `SELECT id, miejscowosc, gmina, powiat, wojewodztwo, latitude, longitude 
     FROM listings 
     WHERE latitude IS NULL OR longitude IS NULL OR latitude = '' OR longitude = ''
     ORDER BY id`
  );

  console.log(`Found ${rows.length} listings missing geocoordinates\n`);

  let success = 0;
  let failed = 0;

  for (const row of rows) {
    const locParts = [row.miejscowosc, row.gmina, row.powiat, row.wojewodztwo]
      .filter(p => p && p !== "-" && p !== "brak danych" && p !== "N/A" && p.length > 1)
      .slice(0, 3);

    if (locParts.length === 0) {
      console.log(`  ID ${row.id}: No location data — skipping`);
      failed++;
      continue;
    }

    const geoQuery = [...locParts, "Polska"].join(", ");
    process.stdout.write(`  ID ${row.id}: "${geoQuery}" → `);

    try {
      const loc = await geocodeAddress(geoQuery);
      if (loc) {
        await conn.execute(
          "UPDATE listings SET latitude = ?, longitude = ?, updatedAt = NOW() WHERE id = ?",
          [String(loc.lat), String(loc.lng), row.id]
        );
        console.log(`✓ ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
        success++;
      } else {
        // Try with just miejscowosc + wojewodztwo
        if (locParts.length > 1) {
          const fallback = [locParts[0], locParts[locParts.length - 1], "Polska"].join(", ");
          process.stdout.write(`(retry: "${fallback}") → `);
          const loc2 = await geocodeAddress(fallback);
          if (loc2) {
            await conn.execute(
              "UPDATE listings SET latitude = ?, longitude = ?, updatedAt = NOW() WHERE id = ?",
              [String(loc2.lat), String(loc2.lng), row.id]
            );
            console.log(`✓ ${loc2.lat.toFixed(4)}, ${loc2.lng.toFixed(4)}`);
            success++;
            continue;
          }
        }
        console.log("✗ no results");
        failed++;
      }
    } catch (e) {
      console.log(`✗ error: ${e.message.substring(0, 80)}`);
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== Done: ${success} geocoded, ${failed} failed ===`);

  // Show final state
  const [final] = await conn.execute(
    "SELECT id, miejscowosc, wojewodztwo, cena, latitude, longitude FROM listings WHERE id >= 53 ORDER BY id"
  );
  console.log("\nFinal state (IDs 53+):");
  for (const r of final) {
    const geo = r.latitude ? `${parseFloat(r.latitude).toFixed(4)}, ${parseFloat(r.longitude).toFixed(4)}` : "MISSING";
    console.log(`  ID ${r.id}: ${r.miejscowosc}, ${r.wojewodztwo} | ${r.cena} | ${geo}`);
  }

  await conn.end();
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
