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
