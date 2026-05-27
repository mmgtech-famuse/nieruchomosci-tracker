# Tracker Ofert Nieruchomości - TODO

## Phase 1: Database & Schema
- [x] Add listings table to drizzle/schema.ts
- [x] Generate and apply migration SQL
- [x] Add db helpers: getAllListings, getListingsByFilters, insertListing, deleteListing

## Phase 2: Backend API
- [x] listings.getAll procedure
- [x] listings.getFiltered procedure
- [x] listings.submitUrl procedure with AI extraction + geocoding
- [x] listings.delete procedure

## Phase 3: Frontend
- [x] App.tsx routing to Listings page
- [x] URL submission form (paste link → AI extracts data)
- [x] Interactive Google Map centered on Poland with color-coded numbered pins
- [x] Map pin info window (ID, miejscowość, cena, URL link)
- [x] Full data table: ID, URL, województwo, powiat, gmina, miejscowość, rozmiar działki, media, przeznaczenie, zabudowania, cena
- [x] Sortable columns in table
- [x] Filter panel: województwo, przeznaczenie, free-text search
- [x] Map–table sync: hover/click row highlights pin, click pin highlights row
- [x] Price legend badges: 🟢 do 300k / 🟡 300–400k / 🟠 400k+ with live counts
- [x] Auto-refresh after new listing submission
- [x] Responsive design

## Phase 4: Data Import
- [x] Import all listings from oferty_dzialek_final_geocoded.xlsx into database (52 rows)

## Phase 5: Tests
- [x] Vitest tests for listings router procedures (7 tests passing)

## Fixes Applied
- [x] AdvancedMarkerElement uses gmp-click event (not click)
- [x] Price parsing handles Polish format: '375 000 zł'
- [x] Map script deduplication (prevent double-load)
- [x] Schema uses VARCHAR for all columns (TiDB TEXT default limitation)

## Przeznaczenie Normalization
- [x] Normalize all existing przeznaczenie values in DB to fixed categories
- [x] Update AI extraction prompt to always return one of the fixed categories
- [x] Update filter dropdown to show fixed categories (ordered, only present categories shown)

## Legal Category Reclassification
- [x] Redefine przeznaczenie categories to legal Polish types: budowlana, rolna, siedliskowa, leśna, rekreacyjna, WZ, inne/brak danych — multi-value tags allowed
- [x] Re-normalize all existing DB entries to new categories
- [x] Update AI extraction prompt for new legal categories (main + fallback)
- [x] Update server-side normalization guard with legal tag detection
- [x] Update filter dropdown with new categories (tag-based contains matching)
- [x] Fix sticky scrollbar for table (mirror scrollbar sticky at bottom of viewport)

## Ratings, Notes & Column Filters
- [x] DB: add `ratings` table (listingId, score 1-5, createdAt) and `notes` column on listings
- [x] Backend: addRating, getRatingStats, updateNotes procedures
- [x] Frontend: star rating widget (1-5 stars) in table row + avg score display + sort by rating
- [x] Frontend: editable notes cell per listing (click to edit, blur/Ctrl+Enter to save)
- [x] Frontend: per-column filter row (text inputs + select dropdowns for all filterable columns)
- [x] Frontend: map pins always reflect current filtered set (all filters: top-bar + column + rating)
- [x] Frontend: filter by minimum average rating (3+, 4+, 5 only)
- [x] Tests: 12 tests passing (addRating, updateNotes, getRatingStats + existing tests)

## FB Description Field, Duplicate Detection & Alerts
- [ ] Backend: accept optional `description` text in submitUrl alongside URL
- [ ] Backend: use description as primary AI content source when provided
- [ ] Backend: duplicate detection — check URL exists before extraction, return special error with existing listing ID
- [ ] Backend: incomplete data flag — if ≥4 key fields are empty/brak danych, return warning with partial data
- [ ] Frontend: expandable "Opis ogłoszenia" textarea (collapsed by default, toggle with "+ Dodaj opis")
- [ ] Frontend: auto-detect Facebook/Instagram URLs and show inline hint before submission
- [ ] Frontend: on duplicate URL — toast with link to existing row + auto-scroll and highlight that row
- [ ] Frontend: on incomplete data — persistent warning toast suggesting to paste description text
