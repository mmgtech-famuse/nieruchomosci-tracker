/**
 * Import listings from oferty_dzialek_final_geocoded.xlsx into the database.
 * Run: node scripts/import-listings.mjs
 */
import { readFileSync } from "fs";
import { createRequire } from "module";
import { createConnection } from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pkg from "xlsx";
const { readFile, utils } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envPath = join(__dirname, "../.env.local");
let envContent = "";
try { envContent = readFileSync(envPath, "utf8"); } catch { envContent = ""; }
const envVars = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) envVars[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const DATABASE_URL = process.env.DATABASE_URL || envVars.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const XLSX_PATH = join(__dirname, "../../upload/oferty_dzialek_final_geocoded.xlsx");

async function main() {
  const workbook = readFile(XLSX_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json(sheet);
  console.log(`Found ${rows.length} rows in spreadsheet`);

  const url = new URL(DATABASE_URL);
  const conn = await createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: {},
  });

  // Clear existing
  await conn.execute("DELETE FROM listings");
  console.log("Cleared existing listings");

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = parseInt(row["ID"] || row["id"]) || null;
    const rowUrl = String(row["url"] || row["URL"] || "").trim();
    const miejscowosc = String(row["miejscowość"] || row["miejscowosc"] || row["Miejscowość"] || "").trim();

    if (!rowUrl && !miejscowosc) { skipped++; continue; }

    const wojewodztwo = String(row["województwo"] || row["wojewodztwo"] || "-").trim();
    const powiat = String(row["powiat"] || "-").trim();
    const gmina = String(row["gmina"] || "-").trim();
    const rozmiarDzialki = String(
      row["rozmiar działki (w jednostkach jakie są podane)"] ||
      row["rozmiar_dzialki"] ||
      row["rozmiarDzialki"] ||
      "-"
    ).trim();
    const media = String(row["media"] || row["Media"] || "-").trim();
    const przeznaczenie = String(row["przeznaczenie"] || row["Przeznaczenie"] || "-").trim();
    const zabudowania = String(row["zabudowania"] || row["Zabudowania"] || "-").trim();
    const cena = String(row["cena"] || row["Cena"] || "-").trim();
    const lat = (row["latitude"] != null && !isNaN(parseFloat(row["latitude"]))) ? parseFloat(row["latitude"]) : null;
    const lng = (row["longitude"] != null && !isNaN(parseFloat(row["longitude"]))) ? parseFloat(row["longitude"]) : null;

    try {
      if (id) {
        await conn.execute(
          `INSERT INTO listings (id, url, wojewodztwo, powiat, gmina, miejscowosc, rozmiarDzialki, media, przeznaczenie, zabudowania, cena, latitude, longitude)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, rowUrl || "-", wojewodztwo, powiat, gmina, miejscowosc || "-", rozmiarDzialki, media, przeznaczenie, zabudowania, cena, lat, lng]
        );
      } else {
        await conn.execute(
          `INSERT INTO listings (url, wojewodztwo, powiat, gmina, miejscowosc, rozmiarDzialki, media, przeznaczenie, zabudowania, cena, latitude, longitude)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [rowUrl || "-", wojewodztwo, powiat, gmina, miejscowosc || "-", rozmiarDzialki, media, przeznaczenie, zabudowania, cena, lat, lng]
        );
      }
      inserted++;
    } catch (err) {
      console.error(`Row ${id || "?"}: ${err.message}`);
      skipped++;
    }
  }

  const [[{ count }]] = await conn.execute("SELECT COUNT(*) as count FROM listings");
  console.log(`\nDone! Inserted: ${inserted}, Skipped: ${skipped}`);
  console.log(`Total in DB: ${count}`);
  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
