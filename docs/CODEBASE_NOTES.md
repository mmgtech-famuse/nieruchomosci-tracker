# Codebase facts (for implementation reference)

Repo: /home/ubuntu/nieruchomosci-tracker (cloned from https://github.com/mmgtech-famuse/nieruchomosci-tracker.git, branch main)
GitHub connector: user DECLINED enabling it. Push at the end: try `git push origin main` (repo is public; may need credentials — ask user if it fails).
pnpm install done. Build: `pnpm check` (tsc), `pnpm test` (vitest), `pnpm build`.

## Key files
- drizzle/schema.ts — UPDATED with new tables (listingNotes, activityLog, tags, listingTags, notifications, userSettings, scoringCriteria, criterionRatings, areasOfInterest, priceHistory) + listings cols (status, pros, cons, distanceKm, distanceMin) + ratings cols (userId, userName)
- drizzle/0006_sweet_shooting_star.sql — generated migration + manual statusIdx + backfill UPDATE (flagged→do_kontaktu)
- shared/types.ts — UPDATED: Listing interface + LISTING_STATUSES, getStatusMeta, TAG_COLORS, NoteEntry, ActivityItem, NotificationItem, CriterionInfo, computeWeightedScore
- server/db.ts — helper functions (getAllListings, insertListing w/ MAX(id)+1, updateListingNotes, toggleFlag, archiveListing, unarchiveListing, addRating, getRatingStats returning Record<listingId,{avg,count}>)
- server/routers.ts (756 lines) — appRouter = router({ system, auth: {me, logout}, listings: { getAll, getFiltered, submitUrl, delete, updateNotes, addRating, getRatingStats, geocodeMissing, reextractUrl, toggleFlag, archiveListing, unarchiveListing, checkUrls, updateField } })
  - checkUrls: fetches each URL, LLM JSON {active, reason}, batches of 5
  - updateField: z.enum([wojewodztwo,powiat,gmina,miejscowosc,rozmiarDzialki,media,przeznaczenie,zabudowania,cena])
  - Geocoding: makeRequest("/maps/api/geocode/json", {address, language:"pl"}) from server/_core/map.ts
  - LLM: invokeLLM({messages, response_format:{type:"json_schema",json_schema:{name,strict:true,schema}}}) from server/_core/llm
- server/_core/trpc.ts: publicProcedure, protectedProcedure (requires ctx.user), router
- server/_core/context.ts: ctx = {req, res, user} where user: users row | null
- client/src/_core/hooks/useAuth.ts: useAuth() → {user, loading, isAuthenticated, logout}; user from trpc.auth.me
- client/src/pages/Listings.tsx (2063 lines) — entire dashboard. Structure:
  - lines ~37-95: price helpers (parsePricePLN, getPriceColor, getPriceTier, getRowTint), sort helpers
  - ~96-190: StarRating, NotesCell components
  - ~194-217: PRZEZNACZENIE_CATEGORIES, SYNONYMS
  - ~221-330: component state (filters, sort, compareIds, submit form, map refs, dialog states) + mutations
  - ~336-410: filtered memo, counts, stats memo, clearFilters, toggleSort
  - ~424-470: click-outside deselect, mirror scrollbar sync
  - ~472-610: map marker effect, createPinElement(id,color,scale,isActive,flagged), showInfoWindow (HTML string), scrollToRow
  - ~628-911: handlers (handleSubmit, handleGeocodeMissing, InlineCell + startEdit/commitEdit, handleDelete, handleRate, handleSaveNotes, handleToggleFlag, handleCheckUrls, handleArchiveSelected, handleDeleteSelected, handleUnarchive)
  - ~915-947: COLUMNS array (with sticky/width/filterable), totalWidth, compareListings memo
  - ~951-996: render: header (title + Geokoduj brakujące + Sprawdź aktualność ofert buttons + help ? button)
  - ~998-1075: Add listing card
  - ~1077-1186: Filters card + legend badges + flagged chip
  - ~1188-1193: Map card (h-[420px] md:h-[500px], MapView initialCenter {52.0,19.5} zoom 6)
  - ~1196-1220: Stats bar (4 cards: Aktywne oferty, Do kontaktu, Średnia cena, Najcz. województwo)
  - ~1222-1523: Table (sticky header, filter row, body rows with InlineCell/NotesCell/StarRating/flag+delete actions)
  - ~1525-1594: Archived section
  - ~1596-1627: Floating compare bar
  - ~1629-1753: Compare Sheet (right side, table of fields)
  - ~1755-1904: Activity check dialog
  - ~1906-2027: Help/tutorial dialog (7 feature cards)
  - ~2029-2058: back-to-top button + fixed mirror scrollbar
- client/src/components/Map.tsx: MapView loads script via forge proxy `${FORGE_BASE_URL}/v1/maps/proxy/maps/api/js?key=...&v=weekly&libraries=marker,places,geocoding,geometry` — need to add `drawing` library for polygons. mapId: "DEMO_MAP_ID"
- client/src/hooks/useMobile.tsx exists (useIsMobile presumably)
- UI components available: all shadcn (dropdown-menu, popover, sheet, dialog, carousel(embla), avatar, badge, tooltip, collapsible, etc.)
- Design language: slate/blue palette, text-xs tables, Card border-slate-200 shadow-sm, rounded-xl stat cards, h-8 controls, Polish labels everywhere
- Tests: server/listings.test.ts mocks ./db (vi.mock with named exports) — when adding new db helpers used in routers, tests may need mock updates ONLY if existing procedures change imports. New procedures fine.
- Existing map pins: circle with id number, color by price tier, yellow border + 🚩 badge if flagged. InfoWindow HTML built in showInfoWindow.
- Flag toggle: optimistic update via utils.listings.getAll.setData
- package.json deps: embla-carousel-react, framer-motion, date-fns, recharts available. NO @googlemaps/markerclusterer yet — need to add.

## Plan decisions (docs/IMPROVEMENTS_DESIGN.md)
- Status pipeline keys: nowy/do_kontaktu/obejrzany/oferta_zlozona/odrzucony; flagged kept in sync (do_kontaktu ⇔ flagged=true)
- Map pins keep price color, add status ring/badge color
- Distance: userSettings home base; server computes via Distance Matrix /maps/api/distancematrix/json; cached in listings.distanceKm/Min; "Dojazd" toggleable column
- checkUrls extended to extract currentPrice; price change → priceHistory + notifications for all users
- Market insights: computed client-side, collapsible panel above table
- Mobile compare: full-screen dialog w/ embla carousel; swipe right=do_kontaktu, left=archive; keyboard: f/a/n/c/arrows/?
- localStorage keys: nt_gestures_hint_shown, nt_show_distance_col

## PROGRESS STATE (updated during phase 3)

DONE:
- Phase 2 complete: schema, migration 0006, shared/types.ts, server/db.ts helpers (all listed above), routers.ts extended:
  - listings.updateStatus, listings.updateProsCons, listings.getRatingRaters added
  - addRating/updateNotes/toggleFlag/archiveListing/submitUrl now log activity; toggleFlag syncs status
  - checkUrls detects price changes (parsePrice helper, currentPrice in LLM schema, recordPrice/updateListingPrice/notifyAllUsers/logActivity); notifies on expired listings
  - submitUrl computes distance from home base after insert (ctx.user + settings)
  - new routers: notes.{getAll,add,delete}, tags.{getAll,getAssignments,create,update,delete,assign,unassign}, activity.getRecent, notifications.{getMine,unreadCount,markRead}, settings.{get,setHomeBase}, scoring.{getCriteria,createCriterion,updateCriterion,deleteCriterion,getScores,setScore}, areas.{getAll,create,update,delete}, insights.getPriceHistory
- Tests updated in server/listings.test.ts (mocks + new describes) — 31 tests pass, tsc clean
- pnpm add @googlemaps/markerclusterer DONE
- Map.tsx: added `drawing` library to script URL
- GitHub connector now ENABLED (user enabled it; push via gh CLI should work at the end)
- Created client/src/components/listing/StatusDropdown.tsx (StatusDropdown{status,onChange,compact})
- Created client/src/components/listing/UserBadge.tsx (UserBadge{name,size,title}, nameToColor, getInitials)
- Created client/src/components/listing/ThreadedNotes.tsx (ThreadedNotesCell{listingId,legacyNotes,notes,onAdd,onDelete,currentUserName,listingLabel}, NotesThread)

## Listings.tsx exact facts (2063 lines):
- imports at top lines 2-35: trpc, Badge, Button, Card..., Input, Select..., Checkbox, Sheet..., Dialog..., Progress, MapView, toast, lucide icons, type { Listing, RatingStats } from "@shared/types"
- state: filterWoj/filterPrz/search, colFilters, minRating, sortKey/sortDir, hoveredId/selectedId, compareIds/compareOpen, submitUrl etc, mapRef/markersRef/infoWindowRef/mapReady, markerClickTimerRef, showBackToTop/pageTopRef, rowRefs/tableContainerRef/tableScrollRef/mirrorScrollRef/mirrorInnerRef/showScrollbar
- queries: trpc.listings.getAll.useQuery() → allListings, trpc.listings.getRatingStats.useQuery() → ratingStats; mutations: submitMutation, deleteMutation, updateNotesMutation, addRatingMutation, geocodeMissingMutation, updateFieldMutation, archiveMutation, unarchiveMutation, checkUrlsMutation, toggleFlagMutation, reextractMutation
- filterFlagged state line ~301; filtered memo lines 341-386 (deps: activeListings, filterWoj, filterPrz, search, colFilters, minRating, sortKey, sortDir, ratingStats, filterFlagged)
- stats memo lines 396-404 {avgPrice, flaggedCount, topWoj}
- map effect 482-548 (markers, fitBounds); marker visuals effect 551-560; createPinElement 562-578 (id,color,scale,isActive,flagged) - wrapper div + circle + flag badge; showInfoWindow 580-610 (HTML string w/ flagHtml); scrollToRow 612-624
- handlers 628-911: handleSubmit, handleGeocodeMissing, InlineCell(755-780), handleDelete, handleRate(794-802), handleSaveNotes(804-811), handleToggleFlag(813-832 optimistic), handleCheckUrls(834-874: CheckResult type {id,url,active,reason}), handleArchiveSelected, handleDeleteSelected, handleUnarchive
- COLUMNS 915-940 (id, url, wojewodztwo, powiat, gmina, miejscowosc, rozmiarDzialki, media, przeznaczenie, zabudowania, notes(w:160), avgRating(w:90), cena(sticky right:36, w:100)); totalWidth +36+32
- render: header 956-996 (title + Geokoduj + Sprawdź aktualność + help btn in ml-auto div); add card 998-1075; filters card 1077-1186 (flagged chip at 1156-1173); map card 1188-1193 (h-[420px] md:h-[500px]); stats bar 1197-1220 (4 cards grid-cols-2 sm:grid-cols-4: Aktywne oferty, Do kontaktu (stats.flaggedCount), Średnia cena, Najcz. województwo); table 1222-1523; row: compare checkbox td, ID td(sticky left 32), URL td, wojewodztwo..zabudowania tds w/ InlineCell, notes td (NotesCell line 1479), avgRating td (StarRating line 1484), cena td (sticky right 36), actions td (sticky right 0, Flag btn + Trash2 btn, lines 1495-1513)
- flaggedStyle row inset boxShadow #eab308 line 1386-1388
- archived section 1526-1594; compare bar 1597-1627; compare Sheet 1630-1753 (table with rows array 1698-1720: Województwo..Cena; compareListings maps); check dialog 1756-1904; help dialog 1907-2027 (7 steps); back-to-top 2030-2041; mirror scrollbar 2044-2058
- useAuth from "@/_core/hooks/useAuth" → {user{id,name,email},loading,isAuthenticated} — NOT yet imported in Listings.tsx
- useIsMobile from "@/hooks/useMobile" (768px breakpoint)
- Carousel from "@/components/ui/carousel" (embla, has CarouselContent/CarouselItem/Previous/Next)
- Popover, Collapsible, Tooltip, Avatar available in ui/

## REMAINING WORK (phases 3-7 frontend, all in Listings.tsx + new components):
1. Phase 3: integrate into Listings.tsx: useAuth; StatusDropdown replacing flag button visuals (keep flag but add status col or replace flag cell); ThreadedNotesCell replacing NotesCell; rater avatars under StarRating (getRatingRaters query); ActivitySidebar (new component, collapsible right Sheet or fixed panel, activity.getRecent)
2. Phase 4: map clustering (MarkerClusterer from @googlemaps/markerclusterer, only cluster when zoomed out); status ring on pins (border color by status); area drawing (DrawingManager, save polygon via areas router, render saved areas, "Rysuj obszar" button on map card); home base marker + settings popover (settings.setHomeBase w/ label input); Dojazd column showing distanceKm/Min (toggleable localStorage nt_show_distance_col); tags: TagPills component in table (new column or under miejscowosc), tag filter chip row, tag management popover
3. Phase 5: pros/cons in compare sheet rows + edit dialog (updateProsCons); weighted scoring section in compare sheet (criteria manage + per-listing scores + computeWeightedScore highlight best)
4. Phase 6: mobile compare full-screen Dialog with Carousel (useIsMobile, swipeable); swipe gestures on table rows (touchstart/touchmove: right → status do_kontaktu, left → archive); keyboard shortcuts (f=flag/status, a=archive, c=compare toggle, arrows=row nav, ?=help) via window keydown listener when no input focused; one-time tooltip toast (localStorage nt_gestures_hint_shown)
5. Phase 7: NotificationBell component in header (bell icon, unreadCount badge, popover list, markRead); market insights collapsible panel above table (avg price/m² per gmina — parse rozmiarDzialki to m², listing lifespan from createdAt vs archived, price range distribution mini-bars); use insights.getPriceHistory for price drop display
6. Phase 8: pnpm check, vitest, pnpm build; migration test if possible; commit+push via gh (connector enabled)

## Design language reminders
- text-xs everywhere in table, h-8 controls, border-slate-200, shadow-sm, rounded-xl stat cards, blue-600 primary, Polish labels
- Toasts via sonner: toast.success/warning/error
