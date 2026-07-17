# Listings.tsx Integration Edits

This file documents the key integration points needed to wire all new components into Listings.tsx.

## 1. Imports (after line 35)
Add:
- useAuth, useIsMobile, useKeyboardShortcuts, useRowSwipe
- All new components: StatusDropdown, UserBadge, ThreadedNotesCell, ActivitySidebar, NotificationBell, TagPills, MarketInsights, HomeBasePopover, ProsCons, WeightedScoring, MobileCompareCarousel, AreaControls
- MarkerClusterer, SuperClusterAlgorithm
- New types: ListingStatus, NoteEntry, TagInfo, getStatusMeta, LISTING_STATUSES, parseAreaPath

## 2. New State (after line 324)
- activityOpen: boolean
- notificationsOpen: boolean
- homeBasePicking: boolean
- drawingAreaColor: string | null
- hiddenAreaIds: Set<number>
- showDistanceColumn: boolean (localStorage nt_show_distance_col)
- showGesturesHint: boolean (localStorage nt_gestures_hint_shown)
- clusterRef: MarkerClusterer | null

## 3. New Queries/Mutations (after line 298)
- trpc.activity.getRecent.useQuery()
- trpc.notifications.getMine.useQuery()
- trpc.notifications.unreadCount.useQuery()
- trpc.settings.get.useQuery()
- trpc.tags.getAll.useQuery()
- trpc.tags.getAssignments.useQuery()
- trpc.scoring.getCriteria.useQuery()
- trpc.scoring.getScores.useQuery()
- trpc.areas.getAll.useQuery()
- trpc.insights.getPriceHistory.useQuery()
- Mutations: updateStatus, updateProsCons, setScore, createTag, updateTag, deleteTag, assignTag, unassignTag, createCriterion, updateCriterion, deleteCriterion, createArea, updateArea, deleteArea, setHomeBase, clearHomeBase, markNotificationRead, markAllNotificationsRead

## 4. Keyboard Shortcuts (after line 416)
useKeyboardShortcuts hook with:
- f: toggle status to "do_kontaktu"
- a: archive selected
- c: toggle compare
- ?: show help

## 5. Map Clustering (in map effect around line 482)
- Initialize MarkerClusterer after markers are added
- Update clustering when markers change
- Use SuperClusterAlgorithm with zoom-aware clustering

## 6. createPinElement (line 562)
- Add status-based border color ring
- Show status indicator on pin

## 7. Table Columns (around line 915)
- Add "Status" column (compact dropdown)
- Add "Dojazd" column (conditional, toggleable)
- Add "Etykiety" column (TagPills)
- Replace notes cell with ThreadedNotesCell
- Add user badge next to rating

## 8. Table Row Rendering (around line 1222)
- Add swipe gesture handlers
- Add status cell with StatusDropdown
- Add distance cell (conditional)
- Add tags cell with TagPills
- Replace NotesCell with ThreadedNotesCell
- Add user avatars to rating cell

## 9. Header (around line 956)
- Add ActivitySidebar button + sidebar component
- Add NotificationBell component
- Add HomeBasePopover component
- Add AreaControls component

## 10. Stats Bar (around line 1197)
- Replace with MarketInsights component above the table

## 11. Compare Sheet (around line 1630)
- Add ProsCons editor rows
- Add WeightedScoringSection

## 12. Mobile Optimizations
- Use MobileCompareCarousel instead of Sheet on mobile
- Show/hide distance column based on screen size
- Adjust table layout for mobile

## 13. Gestures & Hints
- Show one-time tooltip for swipe/keyboard shortcuts
- Implement swipe handlers on rows
