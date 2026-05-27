/**
 * Reclassify przeznaczenie for all 52 listings using original spreadsheet values.
 * Maps raw values → legal multi-tag format.
 */
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';
import XLSX from 'xlsx';

// ── Tag normalization function (same logic as server) ──────────────────────
function normalizePrzeznaczenie(raw) {
  if (!raw || raw === '-') return 'inne/brak danych';
  const r = raw.toLowerCase().trim();
  const tags = [];

  // WZ — warunki zabudowy
  if (r.includes('wz') || r.includes('warunki zabudowy') || r.includes('warunki')) tags.push('WZ');

  // budowlana — building plots (including residential MN, service, industrial)
  if (r.includes('budowlana') || r.includes('budowl') || r.includes('mieszkaniowa') || r.includes('usługowa') || r.includes('przemysłowa') || r.includes('turystyczna') || r.includes('turyst')) tags.push('budowlana');

  // siedliskowa — farmstead
  if (r.includes('siedlisk') || r.includes('zagroda') || r.includes('zagrodowa')) tags.push('siedliskowa');

  // leśna — forest
  if (r.includes('leśna') || r.includes('lesna') || r.includes('leśn')) tags.push('leśna');

  // rekreacyjna — recreational/holiday
  if (r.includes('rekre') || r.includes('letnisk') || r.includes('wypocz')) tags.push('rekreacyjna');

  // rolna — agricultural (after siedliskowa/leśna to avoid double-counting pure siedliskowa)
  if (r.includes('rolna') || r.includes('rolno') || r.includes('rolnicza')) tags.push('rolna');

  if (tags.length === 0) return 'inne/brak danych';
  // Deduplicate preserving order
  return [...new Set(tags)].join(', ');
}

// ── Load spreadsheet ────────────────────────────────────────────────────────
const wb = XLSX.readFile('/home/ubuntu/upload/oferty_dzialek_final_geocoded.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '-' });

// Build map: row index (1-based ID from spreadsheet) → normalized przeznaczenie
const updates = [];
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const id = row['ID'] || (i + 1);
  const rawPrz = row['przeznaczenie'] || '-';
  const normalized = normalizePrzeznaczenie(String(rawPrz));
  updates.push({ id: Number(id), raw: rawPrz, normalized });
}

console.log('\nClassification preview:');
updates.forEach(u => {
  if (u.raw !== '-') console.log(`  ID ${u.id}: "${u.raw}" → "${u.normalized}"`);
});
const unknowns = updates.filter(u => u.raw === '-');
console.log(`\n  ${unknowns.length} listings with '-' (no data) → "inne/brak danych"`);

// ── Connect to DB and apply updates ────────────────────────────────────────
const conn = await mysql.createConnection(process.env.DATABASE_URL);
let updated = 0;
for (const u of updates) {
  await conn.execute('UPDATE listings SET przeznaczenie = ? WHERE id = ?', [u.normalized, u.id]);
  updated++;
}
await conn.end();
console.log(`\n✓ Updated ${updated} listings in database.`);

// Verify
const conn2 = await mysql.createConnection(process.env.DATABASE_URL);
const [rows2] = await conn2.execute('SELECT przeznaczenie, COUNT(*) as count FROM listings GROUP BY przeznaczenie ORDER BY count DESC');
console.log('\nFinal distribution:');
rows2.forEach(r => console.log(`  "${r.przeznaczenie}": ${r.count}`));
await conn2.end();
