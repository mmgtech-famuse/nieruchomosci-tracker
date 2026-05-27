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
