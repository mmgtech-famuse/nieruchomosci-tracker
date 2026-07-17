# Improvements Design — July 2026 batch

This document tracks the design decisions for the 5-category improvement batch.
Constraint: do NOT drastically change the existing design; all features integrate
into the current UI (shadcn/ui, blue/slate palette, current layout).

## New database tables

| Table | Purpose |
| --- | --- |
| `listingNotes` | Threaded, user-attributed notes (replaces free-text notes going forward; legacy `listings.notes` kept for backward compat and shown as "legacy note") |
| `listingTags` + `tags` | Customizable color-coded tags, many-to-many |
| `activityLog` | Simple activity feed (who did what, when) |
| `notifications` | Per-user notifications (price drop, status change, expired listing) |
| `userSettings` | Per-user settings: home base lat/lng/label, criteria weights (JSON), UI prefs |
| `scoringCriteria` | Shared family criteria with weights |
| `criterionRatings` | Per listing per criterion 1-5 rating (per user) |
| `areasOfInterest` | Saved polygons drawn on the map |
| `priceHistory` | Recorded price values per listing over time |

## Columns added to `listings` (all nullable/defaulted → backward compatible)

- `status` varchar(32) NOT NULL DEFAULT 'nowy' — pipeline: nowy / do_kontaktu / obejrzany / odrzucony / oferta_zlozona
- `pros` text — structured pros (newline-separated list)
- `cons` text — structured cons (newline-separated list)
- `distanceKm` / `distanceMin` — cached driving distance/time from home base

Backward compatibility: `flagged=true` maps to status `do_kontaktu`. The
`toggleFlag` procedure still exists and syncs both fields. A one-time SQL
migration sets `status='do_kontaktu'` where `flagged=1`.

## Status pipeline

| Key | Label | Color |
| --- | --- | --- |
| nowy | Nowy | slate |
| do_kontaktu | Do kontaktu | yellow (matches old flag) |
| obejrzany | Obejrzany | blue |
| oferta_zlozona | Oferta złożona | green |
| odrzucony | Odrzucony | red |

Map pins: keep price-tier fill color (existing design), add a small status ring /
badge for non-default statuses so pins "reflect the status visually" without
losing the price color language users know.

## Frontend structure

New components in `client/src/components/listings/`:
- `StatusSelect.tsx` — compact color-coded dropdown for table cells
- `ThreadedNotes.tsx` — inline notes preview + modal with threaded replies
- `TagsCell.tsx` + `TagManagerDialog.tsx` — pill tags + manager
- `ActivitySidebar.tsx` — collapsible right sidebar activity log
- `NotificationsBell.tsx` — header bell with unread count + popover list
- `MarketInsights.tsx` — collapsible panel above the table
- `SettingsDialog.tsx` — home base, scoring criteria/weights
- `ProsConsEditor.tsx` — structured pros/cons editing (modal + compare)
- `ScoreBadge.tsx` — weighted score chip next to star rating
- `CompareCarousel.tsx` — full-screen swipeable compare on mobile
- Map extras stay in `Listings.tsx` (clusterer via @googlemaps/markerclusterer,
  polygon drawing via `drawing` library behind a small map control icon)

## Distances

Home base is stored in `userSettings`. Server route `settings.setHomeBase`
recomputes driving distances for all listings via Google Distance Matrix
(`/maps/api/distancematrix/json`) in batches of 25 and caches in
`listings.distanceKm/distanceMin`. New listings get distance computed at insert
if a home base exists. Toggleable "Dojazd" column (hidden by default,
persisted in localStorage) + info in map tooltips.

## Price drop detection

`checkUrls` already fetches each page; extend AI JSON schema with
`currentPrice`. If price differs from stored `cena`, insert `priceHistory` row +
`notifications` rows for all users + update listing price automatically is NOT
done (user confirms). Notification types: `price_drop`, `price_increase`,
`status_change`, `listing_expired`.

## Market insights

Computed client-side from already-loaded listings (no new API): avg price/m²
per gmina (top 5), average listing lifespan (createdAt→now for active,
createdAt→updatedAt for archived), price-range distribution buckets. Rendered as
small numbers in a collapsible panel above the table, matching stats-bar style.

## Mobile & shortcuts

- `useMobile` hook already exists. Compare: on mobile render full-screen Dialog
  with embla carousel (already a dependency via `embla-carousel-react`).
- Swipe gestures on table rows (touch events): right → cycle status to
  do_kontaktu, left → archive (with undo toast).
- Keyboard shortcuts (desktop, when a row is selected): `f` flag/status,
  `a` archive, `n` focus note, `c` toggle compare selection, `←`/`→` navigate
  rows, `?` help.
- One-time discoverability tooltip stored in localStorage
  (`nt_gestures_hint_shown`).
