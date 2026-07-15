import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { MapView } from "@/components/Map";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flag,
  GitCompareArrows,
  HelpCircle,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { Listing, RatingStats } from "@shared/types";

// ─── Price helpers ──────────────────────────────────────────────────────────

function parsePricePLN(cena: string): number | null {
  if (!cena || cena === "-") return null;
  const stripped = cena.replace(/[złPLNzl\s]/gi, "").replace(/[,\.]/g, "");
  const num = parseFloat(stripped);
  if (isNaN(num)) return null;
  return num;
}

function getPriceColor(cena: string): string {
  const price = parsePricePLN(cena);
  if (price === null) return "#94a3b8";
  if (price <= 300000) return "#22c55e";
  if (price <= 400000) return "#eab308";
  return "#f97316";
}

function getPriceTier(cena: string): "green" | "yellow" | "orange" | "unknown" {
  const price = parsePricePLN(cena);
  if (price === null) return "unknown";
  if (price <= 300000) return "green";
  if (price <= 400000) return "yellow";
  return "orange";
}

function getRowTint(cena: string, isSelected: boolean, isHovered: boolean): React.CSSProperties {
  const tier = getPriceTier(cena);
  if (isSelected) {
    const borderColors: Record<string, string> = { green: "#16a34a", yellow: "#ca8a04", orange: "#ea580c", unknown: "#64748b" };
    return { backgroundColor: "#dbeafe", borderLeft: `4px solid ${borderColors[tier]}`, outline: "none" };
  }
  if (isHovered) {
    const bgColors: Record<string, string> = { green: "#f0fdf4", yellow: "#fefce8", orange: "#fff7ed", unknown: "#f8fafc" };
    return { backgroundColor: bgColors[tier], borderLeft: `4px solid ${getPriceColor(cena)}44` };
  }
  const restBg: Record<string, string> = { green: "#f0fdf480", yellow: "#fefce880", orange: "#fff7ed80", unknown: "transparent" };
  return { backgroundColor: restBg[tier], borderLeft: `4px solid ${getPriceColor(cena)}22` };
}

// ─── Sort helpers ────────────────────────────────────────────────────────────

type SortKey = keyof Listing | "avgRating" | null;
type SortDir = "asc" | "desc";

function sortListings(items: Listing[], key: SortKey, dir: SortDir, ratingStats: RatingStats): Listing[] {
  if (!key) return items;
  return [...items].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    if (key === "id") { av = a.id; bv = b.id; }
    else if (key === "cena") { av = parsePricePLN(a.cena) ?? -1; bv = parsePricePLN(b.cena) ?? -1; }
    else if (key === "avgRating") { av = ratingStats[a.id]?.avg ?? 0; bv = ratingStats[b.id]?.avg ?? 0; }
    else { av = String((a as unknown as Record<string, unknown>)[key] ?? ""); bv = String((b as unknown as Record<string, unknown>)[key] ?? ""); }
    if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
    return dir === "asc" ? String(av).localeCompare(String(bv), "pl") : String(bv).localeCompare(String(av), "pl");
  });
}

// ─── Star Rating Component ────────────────────────────────────────────────────

function StarRating({
  listingId,
  stats,
  onRate,
}: {
  listingId: number;
  stats?: { avg: number; count: number };
  onRate: (listingId: number, score: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const avg = stats?.avg ?? 0;
  const count = stats?.count ?? 0;
  const displayScore = hover || Math.round(avg);

  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            className="p-0 leading-none transition-transform hover:scale-110 active:scale-95"
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={e => { e.stopPropagation(); onRate(listingId, star); }}
            title={`Oceń ${star}/5`}
          >
            <Star
              className="w-3.5 h-3.5"
              fill={star <= displayScore ? (hover ? "#f59e0b" : "#f59e0b") : "none"}
              stroke={star <= displayScore ? "#f59e0b" : "#cbd5e1"}
            />
          </button>
        ))}
      </div>
      {count > 0 && (
        <span className="text-[10px] text-slate-400 leading-none">
          {avg.toFixed(1)} ({count})
        </span>
      )}
    </div>
  );
}

// ─── Notes Cell Component ─────────────────────────────────────────────────────

function NotesCell({
  listingId,
  notes,
  onSave,
}: {
  listingId: number;
  notes: string | null;
  onSave: (listingId: number, notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setValue(notes ?? ""); }, [notes]);

  const handleSave = () => {
    setEditing(false);
    if (value !== (notes ?? "")) onSave(listingId, value);
  };

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        autoFocus
        className="w-full text-xs border border-blue-300 rounded p-1 resize-none bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        rows={3}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={e => { if (e.key === "Escape") { setValue(notes ?? ""); setEditing(false); } if (e.key === "Enter" && e.ctrlKey) handleSave(); }}
        onClick={e => e.stopPropagation()}
        style={{ minWidth: "160px" }}
      />
    );
  }

  return (
    <div
      className="text-xs text-slate-500 cursor-text hover:text-slate-700 hover:bg-slate-50 rounded px-1 py-0.5 min-h-[20px] transition-colors"
      style={{ whiteSpace: "pre-wrap", lineHeight: "1.4", minWidth: "100px" }}
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      title="Kliknij aby edytować notatkę"
    >
      {value || <span className="text-slate-300 italic">+ dodaj notatkę</span>}
    </div>
  );
}

// ─── Fixed categories ─────────────────────────────────────────────────────────

const PRZEZNACZENIE_CATEGORIES = [
  "budowlana", "rolna", "siedliskowa", "leśna", "rekreacyjna", "WZ", "inne/brak danych",
];

// ─── Synonym map for search ───────────────────────────────────────────────────

const SYNONYMS: Record<string, string[]> = {
  budowlana: ["budowlana", "budowl", "mieszkaniowa", "mn", "usługowa"],
  budowlane: ["budowlana", "budowl"],
  rolna: ["rolna", "rolno", "rolnicza", "rolne"],
  rolne: ["rolna", "rolno"],
  siedliskowa: ["siedlisk", "zagroda"],
  leśna: ["leśna", "lesna", "las"],
  lesna: ["leśna", "lesna"],
  rekreacyjna: ["rekre", "letnisk", "wypocz", "turyst"],
  letniskowa: ["letnisk", "rekre"],
  wz: ["wz", "warunki zabudowy"],
  warunki: ["wz", "warunki"],
  prąd: ["prąd", "energia", "elektryczność", "energetyczny"],
  woda: ["woda", "wodociąg", "wodociągowa", "studnia"],
  gaz: ["gaz", "gazowy", "gazociąg"],
  kanalizacja: ["kanalizacja", "szambo", "szambem"],
  dom: ["dom", "budynek", "zabudow"],
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function Listings() {
  const utils = trpc.useUtils();

  // Global filters (top bar)
  const [filterWoj, setFilterWoj] = useState("");
  const [filterPrz, setFilterPrz] = useState("");
  const [search, setSearch] = useState("");

  // Column-level filters (per-column header inputs)
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [minRating, setMinRating] = useState(0); // 0 = no filter

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Selection
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Compare mode
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);

  const toggleCompare = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  // URL submission
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitDescription, setSubmitDescription] = useState("");
  const [showDescriptionField, setShowDescriptionField] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isFbUrl = submitUrl.includes("facebook.com") || submitUrl.includes("fb.com");

  // Map refs
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Timer for single vs double-click disambiguation on markers
  const markerClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Back-to-top
  const [showBackToTop, setShowBackToTop] = useState(false);
  const pageTopRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Table refs
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const tableContainerRef = useRef<HTMLDivElement>(null); // click-outside wrapper
  const tableScrollRef = useRef<HTMLDivElement>(null);    // overflow-x-auto
  const mirrorScrollRef = useRef<HTMLDivElement>(null);
  const mirrorInnerRef = useRef<HTMLDivElement>(null);
  const [showScrollbar, setShowScrollbar] = useState(false);

  // Data
  const { data: allListings = [], isLoading, refetch } = trpc.listings.getAll.useQuery();
  const { data: ratingStats = {}, refetch: refetchRatings } = trpc.listings.getRatingStats.useQuery();
  const submitMutation = trpc.listings.submitUrl.useMutation();
  const deleteMutation = trpc.listings.delete.useMutation();
  const updateNotesMutation = trpc.listings.updateNotes.useMutation();
  const addRatingMutation = trpc.listings.addRating.useMutation();
  const geocodeMissingMutation = trpc.listings.geocodeMissing.useMutation();
  const updateFieldMutation = trpc.listings.updateField.useMutation();
  const archiveMutation = trpc.listings.archiveListing.useMutation();
  const unarchiveMutation = trpc.listings.unarchiveListing.useMutation();
  const checkUrlsMutation = trpc.listings.checkUrls.useMutation();
  const toggleFlagMutation = trpc.listings.toggleFlag.useMutation();

  // Flag filter
  const [filterFlagged, setFilterFlagged] = useState(false);

  // Activity check dialog state
  type CheckResult = { id: number; url: string; active: boolean; reason: string };
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);
  const [checkProgress, setCheckProgress] = useState(0); // 0-100
  const [checkRunning, setCheckRunning] = useState(false);
  const [selectedInactive, setSelectedInactive] = useState<Set<number>>(new Set());
  const [checkCurrentUrl, setCheckCurrentUrl] = useState("");
  const [checkDone, setCheckDone] = useState(0);

  // Archived section
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  // Help / tutorial dialog
  const [helpOpen, setHelpOpen] = useState(false);

  // Map expand toggle
  const [mapExpanded, setMapExpanded] = useState(false);
  const reextractMutation = trpc.listings.reextractUrl.useMutation();
  const [isGeocodingMissing, setIsGeocodingMissing] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Derived: unique filter values
  const uniqueWoj = useMemo(
    () => Array.from(new Set(allListings.map(l => l.wojewodztwo).filter(v => v && v !== "-"))).sort((a, b) => a.localeCompare(b, "pl")),
    [allListings]
  );
  const uniquePrz = useMemo(
    () => PRZEZNACZENIE_CATEGORIES.filter(cat => allListings.some(l => l.przeznaczenie?.toLowerCase().includes(cat.toLowerCase()))),
    [allListings]
  );

  // Split active vs archived
  const activeListings = useMemo(() => allListings.filter(l => !l.archived), [allListings]);
  const archivedListings = useMemo(() => allListings.filter(l => l.archived), [allListings]);

  // Filtered + sorted listings (active only)
  const filtered = useMemo(() => {
    let items = activeListings.filter(l => {
      // Top-bar filters
      if (filterWoj && l.wojewodztwo !== filterWoj) return false;
      if (filterPrz && !l.przeznaczenie?.toLowerCase().includes(filterPrz.toLowerCase())) return false;
      if (search) {
        const q = search.toLowerCase().trim();
        const terms = [q, ...(SYNONYMS[q] || [])];
        const haystack = [l.miejscowosc, l.gmina, l.powiat, l.wojewodztwo, l.przeznaczenie, l.media, l.zabudowania, l.rozmiarDzialki, l.cena, String(l.id)].join(" ").toLowerCase();
        if (!terms.some(t => haystack.includes(t))) return false;
      }
      // Column filters
      for (const [col, val] of Object.entries(colFilters)) {
        if (!val) continue;
        const v = val.toLowerCase().trim();
        const field = (l as unknown as Record<string, unknown>)[col];
        if (col === "cena") {
          // Support range like "100-300" or "< 300" or "> 200"
          const price = parsePricePLN(l.cena);
          if (v.includes("-")) {
            const [lo, hi] = v.split("-").map(s => parseFloat(s.replace(/\s/g, "")) * 1000);
            if (price === null || price < lo || price > hi) return false;
          } else if (v.startsWith("<")) {
            const hi = parseFloat(v.slice(1).trim()) * 1000;
            if (price === null || price >= hi) return false;
          } else if (v.startsWith(">")) {
            const lo = parseFloat(v.slice(1).trim()) * 1000;
            if (price === null || price <= lo) return false;
          } else {
            if (!String(l.cena).toLowerCase().includes(v)) return false;
          }
        } else {
          if (!String(field ?? "").toLowerCase().includes(v)) return false;
        }
      }
      // Min rating filter
      if (minRating > 0) {
        const avg = ratingStats[l.id]?.avg ?? 0;
        if (avg < minRating) return false;
      }
      // Flagged filter
      if (filterFlagged && !l.flagged) return false;
      return true;
    });
    return sortListings(items, sortKey, sortDir, ratingStats);
  }, [activeListings, filterWoj, filterPrz, search, colFilters, minRating, sortKey, sortDir, ratingStats, filterFlagged]);

  // Price tier counts
  const counts = useMemo(() => {
    const c = { green: 0, yellow: 0, orange: 0, unknown: 0 };
    filtered.forEach(l => { c[getPriceTier(l.cena)]++; });
    return c;
  }, [filtered]);

  // Summary stats for the stats bar
  const stats = useMemo(() => {
    const prices = activeListings.map(l => parsePricePLN(l.cena)).filter((p): p is number => p !== null);
    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
    const flaggedCount = activeListings.filter(l => l.flagged).length;
    const wojMap: Record<string, number> = {};
    activeListings.forEach(l => { if (l.wojewodztwo && l.wojewodztwo !== "-") wojMap[l.wojewodztwo] = (wojMap[l.wojewodztwo] ?? 0) + 1; });
    const topWoj = Object.entries(wojMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { avgPrice, flaggedCount, topWoj };
  }, [activeListings]);

  const hasFilters = !!(filterWoj || filterPrz || search || Object.values(colFilters).some(Boolean) || minRating > 0 || filterFlagged);

  function clearFilters() {
    setFilterWoj(""); setFilterPrz(""); setSearch("");
    setColFilters({}); setMinRating(0); setFilterFlagged(false);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  // ── Click-outside deselect ─────────────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tableContainerRef.current && !tableContainerRef.current.contains(e.target as Node)) {
        setSelectedId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Mirror scrollbar sync (fixed, always visible when table in view) ────────
  useEffect(() => {
    const table = tableScrollRef.current;
    const mirror = mirrorScrollRef.current;
    const inner = mirrorInnerRef.current;
    const wrapper = tableContainerRef.current;
    if (!table || !mirror || !inner) return;

    const updateWidth = () => {
      inner.style.width = table.scrollWidth + "px";
      if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        mirror.style.width = rect.width + "px";
        mirror.style.left = rect.left + "px";
      }
    };
    updateWidth();

    let syncingFromTable = false;
    let syncingFromMirror = false;
    const onTableScroll = () => { if (syncingFromMirror) return; syncingFromTable = true; mirror.scrollLeft = table.scrollLeft; syncingFromTable = false; };
    const onMirrorScroll = () => { if (syncingFromTable) return; syncingFromMirror = true; table.scrollLeft = mirror.scrollLeft; syncingFromMirror = false; };

    table.addEventListener("scroll", onTableScroll);
    mirror.addEventListener("scroll", onMirrorScroll);
    window.addEventListener("resize", updateWidth);

    const observer = new IntersectionObserver(([entry]) => { setShowScrollbar(entry.isIntersecting); }, { threshold: 0.01 });
    if (wrapper) observer.observe(wrapper);

    return () => {
      table.removeEventListener("scroll", onTableScroll);
      mirror.removeEventListener("scroll", onMirrorScroll);
      window.removeEventListener("resize", updateWidth);
      observer.disconnect();
    };
  }, []);

  // ── Map: create/update markers ─────────────────────────────────────────────
  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();
    setMapReady(true);
  }, []);

  const activeMapId = selectedId ?? hoveredId;

  // Map always reflects filtered set
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const filteredIds = new Set(filtered.map(l => l.id));

    // Remove markers not in filtered set
    markersRef.current.forEach((marker, id) => {
      if (!filteredIds.has(id)) { marker.map = null; markersRef.current.delete(id); }
    });

    // Add/update markers for filtered listings
    filtered.forEach(listing => {
      if (!listing.latitude || !listing.longitude) return;
      const lat = parseFloat(String(listing.latitude));
      const lng = parseFloat(String(listing.longitude));
      if (isNaN(lat) || isNaN(lng)) return;

      const color = getPriceColor(listing.cena);
      const isActive = activeMapId === listing.id;
      const scale = isActive ? 1.45 : 1;

      if (markersRef.current.has(listing.id)) {
        const existing = markersRef.current.get(listing.id)!;
        existing.content = createPinElement(listing.id, color, scale, isActive, listing.flagged);
        existing.zIndex = isActive ? 999 : listing.id;
        return;
      }

      const markerEl = createPinElement(listing.id, color, scale, isActive, listing.flagged);
      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat, lng },
        map: mapRef.current,
        title: `${listing.id}: ${listing.miejscowosc}`,
        content: markerEl,
        zIndex: isActive ? 999 : listing.id,
      });

      // Single click: open info window + select (no table scroll)
      // Double click (via timer): scroll to table row + flash
      marker.addListener("gmp-click", () => {
        if (markerClickTimerRef.current) {
          // Second click within 300ms → treat as double-click
          clearTimeout(markerClickTimerRef.current);
          markerClickTimerRef.current = null;
          setSelectedId(listing.id);
          scrollToRow(listing.id, true);
        } else {
          // First click — wait 300ms to see if a second arrives
          markerClickTimerRef.current = setTimeout(() => {
            markerClickTimerRef.current = null;
            setSelectedId(listing.id);
            showInfoWindow(listing, marker);
          }, 300);
        }
      });

      markersRef.current.set(listing.id, marker);
    });

    // Fit bounds only on initial load (no active selection, markers just created)
    if (!activeMapId && markersRef.current.size > 0) {
      const bounds = new google.maps.LatLngBounds();
      let hasPoints = false;
      markersRef.current.forEach(m => { const pos = m.position; if (pos) { bounds.extend(pos); hasPoints = true; } });
      if (hasPoints) mapRef.current.fitBounds(bounds, 40);
    }
  }, [filtered, mapReady, activeMapId]);

  // Update marker visuals when active id changes
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const listing = allListings.find(l => l.id === id);
      if (!listing) return;
      const color = getPriceColor(listing.cena);
      const isActive = activeMapId === id;
      marker.content = createPinElement(id, color, isActive ? 1.45 : 1, isActive, listing.flagged);
      marker.zIndex = isActive ? 999 : id;
    });
  }, [activeMapId, allListings]);

  function createPinElement(id: number, color: string, scale: number, isActive: boolean, flagged = false): HTMLElement {
    const size = Math.round(28 * scale);
    const fontSize = Math.round(11 * scale);
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative;display:inline-flex;";
    const el = document.createElement("div");
    el.style.cssText = `width:${size}px;height:${size}px;background:${color};border:${isActive ? "3px" : "2px"} solid ${flagged ? "#eab308" : "white"};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:bold;color:white;cursor:pointer;box-shadow:${isActive ? `0 0 0 3px ${color}66,0 4px 12px rgba(0,0,0,0.4)` : flagged ? "0 0 0 2px #eab30866,0 2px 6px rgba(0,0,0,0.35)" : "0 2px 6px rgba(0,0,0,0.35)"};transition:transform 0.15s ease;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;user-select:none;`;
    el.textContent = String(id);
    wrapper.appendChild(el);
    if (flagged) {
      const badge = document.createElement("div");
      badge.style.cssText = "position:absolute;top:-4px;right:-4px;width:13px;height:13px;background:#eab308;border-radius:50%;border:1.5px solid white;display:flex;align-items:center;justify-content:center;font-size:8px;line-height:1;";
      badge.textContent = "🚩";
      wrapper.appendChild(badge);
    }
    return wrapper;
  }

  function showInfoWindow(listing: Listing, marker: google.maps.marker.AdvancedMarkerElement) {
    if (!infoWindowRef.current) return;
    const color = getPriceColor(listing.cena);
    const stats = ratingStats[listing.id];
    const starsHtml = stats && stats.count > 0
      ? `<span style="color:#f59e0b">${"★".repeat(Math.round(stats.avg))}</span><span style="color:#e2e8f0">${"★".repeat(5 - Math.round(stats.avg))}</span> <span style="color:#94a3b8;font-size:11px;">${stats.avg.toFixed(1)} (${stats.count})</span>`
      : "";
    const flagHtml = listing.flagged ? `<span style="background:#fef9c3;color:#92400e;font-size:10px;padding:2px 6px;border-radius:999px;border:1px solid #fde68a;margin-left:4px;">🚩 do kontaktu</span>` : "";
    const mediaHtml = listing.media && listing.media !== "-" ? `<div style="font-size:11px;color:#64748b;margin-bottom:3px;">⚡ ${listing.media}</div>` : "";
    const rozmiarHtml = listing.rozmiarDzialki && listing.rozmiarDzialki !== "-" ? `<div style="font-size:11px;color:#64748b;margin-bottom:3px;">📍 ${listing.rozmiarDzialki}</div>` : "";
    infoWindowRef.current.setContent(`
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-width:210px;max-width:260px;padding:4px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:28px;height:28px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;flex-shrink:0;">${listing.id}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;display:flex;align-items:center;gap:4px;">${listing.miejscowosc}${flagHtml}</div>
            <div style="font-size:11px;color:#64748b;">${listing.gmina}, ${listing.powiat}, ${listing.wojewodztwo}</div>
          </div>
        </div>
        <div style="font-size:16px;font-weight:700;color:${color};margin-bottom:6px;">${listing.cena}</div>
        ${listing.przeznaczenie && listing.przeznaczenie !== "-" ? `<div style="font-size:11px;color:#475569;margin-bottom:3px;background:#f1f5f9;padding:2px 6px;border-radius:4px;display:inline-block;">${listing.przeznaczenie}</div><br style="margin-bottom:3px;">` : ""}
        ${rozmiarHtml}${mediaHtml}
        ${starsHtml ? `<div style="font-size:13px;margin-bottom:6px;margin-top:2px;">${starsHtml}</div>` : ""}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid #f1f5f9;">
          <a href="${listing.url}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#3b82f6;text-decoration:none;">🔗 Otwórz ogłoszenie</a>
          <span style="font-size:10px;color:#94a3b8;">2×klik → tabela</span>
        </div>
      </div>
    `);
    infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
  }

  function scrollToRow(id: number, flash = false) {
    const el = rowRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (flash) {
      el.style.transition = "background-color 0s";
      el.style.backgroundColor = "#bfdbfe"; // blue-200
      setTimeout(() => {
        el.style.transition = "background-color 0.8s ease";
        el.style.backgroundColor = "";
      }, 350);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!submitUrl.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        url: submitUrl.trim(),
        description: submitDescription.trim() || undefined,
      });
      await refetch();
      setSubmitUrl("");
      setSubmitDescription("");
      setShowDescriptionField(false);
      const meta = (result as { _meta?: { fetchSuccess: boolean; geocoded: boolean; isFacebook: boolean; incompleteData: boolean; hasUserDescription: boolean } })._meta;
      if (meta?.incompleteData && !meta.hasUserDescription) {
        // Incomplete data — suggest pasting description
        toast.warning(`Dodano ofertę #${result.id} — dane niekompletne`, {
          description: meta.isFacebook
            ? "💡 Facebook blokuje pobieranie treści. Dla pełnych danych wklej opis ogłoszenia w polu \"+ Dodaj opis\"."
            : "💡 Nie udało się odczytać strony. Spróbuj wkleić opis ogłoszenia ręcznie.",
          duration: 8000,
        });
        setShowDescriptionField(true); // auto-expand description field
      } else if (meta?.fetchSuccess || meta?.hasUserDescription) {
        toast.success(`Dodano ofertę #${result.id} — ${result.miejscowosc}`, {
          description: meta.geocoded ? "✓ Zlokalizowano na mapie" : "⚠ Brak współrzędnych — pin nie pojawi się na mapie",
        });
      } else {
        toast.warning(`Dodano ofertę #${result.id} (ograniczone dane)`, {
          description: "Nie udało się pobrać treści strony. Dane mogą być niekompletne.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Nieznany błąd";
      // Duplicate detection
      if (msg.startsWith("DUPLICATE:")) {
        const dupId = parseInt(msg.replace("DUPLICATE:", ""), 10);
        const hasDesc = submitDescription.trim().length > 0;

        if (hasDesc) {
          // User provided a description — auto-update the existing listing
          try {
            await reextractMutation.mutateAsync({ id: dupId, description: submitDescription.trim() });
            await refetch();
            setSubmitUrl("");
            setSubmitDescription("");
            setShowDescriptionField(false);
            toast.success(`Zaktualizowano ofertę #${dupId}`, {
              description: "Dane istniejącej oferty zostały odświeżone na podstawie wklejonego opisu.",
              duration: 6000,
            });
            setSelectedId(dupId);
            setTimeout(() => {
              const row = rowRefs.current.get(dupId);
              if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 300);
          } catch (reErr: unknown) {
            const reMsg = reErr instanceof Error ? reErr.message : "Nieznany błąd";
            toast.error("Błąd aktualizacji", { description: reMsg });
          }
        } else {
          // No description — show toast with action button to update
          setSelectedId(dupId);
          setTimeout(() => {
            const row = rowRefs.current.get(dupId);
            if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 300);
          toast.warning(`⚠ Oferta #${dupId} już istnieje w bazie`, {
            description: isFbUrl
              ? "Kliknij '+ Dodaj opis' i wklej treść ogłoszenia — zaktualizuję dane istniejącej oferty."
              : "Ta oferta już jest w tabeli. Aby odświeżyć jej dane, kliknij '+ Dodaj opis' i wklej treść ogłoszenia.",
            duration: 8000,
            action: {
              label: "+ Dodaj opis",
              onClick: () => setShowDescriptionField(true),
            },
          });
        }
      } else {
        toast.error("Błąd podczas dodawania", { description: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGeocodeMissing() {
    setIsGeocodingMissing(true);
    try {
      const result = await geocodeMissingMutation.mutateAsync();
      await refetch();
      toast.success(`Geokodowanie zakończone`, {
        description: `✓ ${result.success} zlokalizowanych, ${result.failed} bez danych lokalizacji (razem: ${result.total})`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Nieznany błąd";
      toast.error("Błąd geokodowania", { description: msg });
    } finally {
      setIsGeocodingMissing(false);
    }
  }

  type EditableField = "wojewodztwo" | "powiat" | "gmina" | "miejscowosc" | "rozmiarDzialki" | "media" | "przeznaczenie" | "zabudowania" | "cena";
  const EDITABLE_FIELDS: EditableField[] = ["wojewodztwo", "powiat", "gmina", "miejscowosc", "rozmiarDzialki", "media", "przeznaczenie", "zabudowania", "cena"];

  function startEdit(id: number, field: string, currentValue: string) {
    setEditingCell({ id, field });
    setEditingValue(currentValue ?? "");
  }

  async function commitEdit() {
    if (!editingCell) return;
    try {
      await updateFieldMutation.mutateAsync({
        id: editingCell.id,
        field: editingCell.field as EditableField,
        value: editingValue.trim(),
      });
      await refetch();
      setEditingCell(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Nieznany błąd";
      toast.error("Błąd zapisu", { description: msg });
    }
  }

  function cancelEdit() { setEditingCell(null); }

  function InlineCell({ id, field, value }: { id: number; field: string; value: string }) {
    const isEditing = editingCell?.id === id && editingCell?.field === field;
    const isEditable = EDITABLE_FIELDS.includes(field as EditableField);
    if (!isEditable) return <span>{value}</span>;
    if (isEditing) {
      return (
        <input
          autoFocus
          className="w-full text-xs border border-blue-400 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={editingValue}
          onChange={e => setEditingValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } if (e.key === "Escape") cancelEdit(); }}
          onClick={e => e.stopPropagation()}
          style={{ minWidth: "60px", maxWidth: "100%" }}
        />
      );
    }
    return (
      <span
        className="cursor-text hover:bg-blue-50 hover:text-blue-700 rounded px-0.5 transition-colors"
        title="Kliknij dwukrotnie aby edytować"
        onDoubleClick={e => { e.stopPropagation(); startEdit(id, field, value); }}
      >{value || <span className="text-slate-300 italic text-[10px]">—</span>}</span>
    );
  }

  async function handleDelete(id: number) {
    if (!confirm(`Usunąć ofertę #${id}?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      await refetch();
      if (selectedId === id) setSelectedId(null);
      toast.success(`Oferta #${id} usunięta`);
    } catch {
      toast.error("Błąd podczas usuwania");
    }
  }

  async function handleRate(listingId: number, score: number) {
    try {
      await addRatingMutation.mutateAsync({ listingId, score });
      await refetchRatings();
      toast.success(`Oceniono ofertę #${listingId}: ${score}/5`);
    } catch {
      toast.error("Błąd podczas oceniania");
    }
  }

  async function handleSaveNotes(listingId: number, notes: string) {
    try {
      await updateNotesMutation.mutateAsync({ id: listingId, notes });
      await refetch();
    } catch {
      toast.error("Błąd podczas zapisywania notatki");
    }
  }

  async function handleToggleFlag(listing: Listing) {
    const newFlagged = !listing.flagged;
    // Optimistic update
    utils.listings.getAll.setData(undefined, (old) =>
      old ? old.map(l => l.id === listing.id ? { ...l, flagged: newFlagged } : l) : old
    );
    try {
      await toggleFlagMutation.mutateAsync({ id: listing.id, flagged: newFlagged });
      toast.success(
        newFlagged ? `Oferta #${listing.id} oznaczona “do kontaktu” 🚩` : `Oferta #${listing.id}: flaga usunięta`,
        { duration: 2000 }
      );
    } catch {
      // Rollback
      utils.listings.getAll.setData(undefined, (old) =>
        old ? old.map(l => l.id === listing.id ? { ...l, flagged: !newFlagged } : l) : old
      );
      toast.error("Błąd podczas zmiany flagi");
    }
  }

  async function handleCheckUrls() {
    setCheckDialogOpen(true);
    setCheckRunning(true);
    setCheckResults([]);
    setCheckProgress(0);
    setCheckDone(0);
    setCheckCurrentUrl("");
    setSelectedInactive(new Set());
    try {
      const total = activeListings.length;
      if (total === 0) { setCheckRunning(false); return; }

      // Simulate incremental progress while the server is processing
      // (server runs in batches of 5; we animate progress smoothly)
      let simDone = 0;
      const interval = setInterval(() => {
        simDone = Math.min(simDone + 1, total - 1);
        setCheckDone(simDone);
        setCheckProgress(Math.round((simDone / total) * 95)); // cap at 95% until done
        const listing = activeListings[simDone];
        if (listing) setCheckCurrentUrl(listing.url);
      }, Math.max(800, (total * 4000) / total)); // pace based on count

      const results = await checkUrlsMutation.mutateAsync({});
      clearInterval(interval);

      setCheckResults(results);
      setCheckProgress(100);
      setCheckDone(total);
      setCheckCurrentUrl("");

      // Auto-select all inactive
      const inactiveIds = new Set(results.filter(r => !r.active).map(r => r.id));
      setSelectedInactive(inactiveIds);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Nieznany błąd";
      toast.error("Błąd sprawdzania", { description: msg });
    } finally {
      setCheckRunning(false);
    }
  }

  async function handleArchiveSelected() {
    const ids = Array.from(selectedInactive);
    let done = 0;
    for (const id of ids) {
      try { await archiveMutation.mutateAsync({ id }); done++; } catch { /* skip */ }
    }
    await refetch();
    setCheckDialogOpen(false);
    setCheckResults([]);
    setSelectedInactive(new Set());
    toast.success(`Zarchiwizowano ${done} ofert`);
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selectedInactive);
    if (!confirm(`Usunąć ${ids.length} ofert na stałe?`)) return;
    let done = 0;
    for (const id of ids) {
      try { await deleteMutation.mutateAsync({ id }); done++; } catch { /* skip */ }
    }
    await refetch();
    setCheckDialogOpen(false);
    setCheckResults([]);
    setSelectedInactive(new Set());
    toast.success(`Usunięto ${done} ofert`);
  }

  async function handleUnarchive(id: number) {
    try {
      await unarchiveMutation.mutateAsync({ id });
      await refetch();
      toast.success(`Oferta #${id} przywrócona`);
    } catch {
      toast.error("Błąd podczas przywrócenia");
    }
  }

  // ── Column definitions ────────────────────────────────────────────────────

  const COLUMNS: {
    key: string;
    label: string;
    sortable?: boolean;
    filterable?: boolean;
    filterType?: "text" | "select";
    filterOptions?: string[];
    sticky?: "left" | "right";
    stickyOffset?: number;
    width: number;
    wrap?: boolean;
  }[] = [
    { key: "id",             label: "ID",              sortable: true,  filterable: true,  filterType: "text",   sticky: "left",  stickyOffset: 0,  width: 44 },
    { key: "url",            label: "URL",                                                                                                           width: 48 },
    { key: "wojewodztwo",    label: "Województwo",     sortable: true,  filterable: true,  filterType: "select", filterOptions: uniqueWoj,           width: 120 },
    { key: "powiat",         label: "Powiat",          sortable: true,  filterable: true,  filterType: "text",                                       width: 110 },
    { key: "gmina",          label: "Gmina",           sortable: true,  filterable: true,  filterType: "text",                                       width: 110 },
    { key: "miejscowosc",    label: "Miejscowość",     sortable: true,  filterable: true,  filterType: "text",                                       width: 110 },
    { key: "rozmiarDzialki", label: "Rozmiar działki", sortable: true,  filterable: true,  filterType: "text",                                       width: 100 },
    { key: "media",          label: "Media",                            filterable: true,  filterType: "text",                    wrap: true,         width: 170 },
    { key: "przeznaczenie",  label: "Przeznaczenie",   sortable: true,  filterable: true,  filterType: "select", filterOptions: uniquePrz,           width: 130 },
    { key: "zabudowania",    label: "Zabudowania",                      filterable: true,  filterType: "text",                    wrap: true,         width: 190 },
    { key: "notes",          label: "Notatki",                                                                                   wrap: true,         width: 160 },
    { key: "avgRating",      label: "Ocena",           sortable: true,                                                                               width: 90 },
    { key: "cena",           label: "Cena",            sortable: true,  filterable: true,  filterType: "text",   sticky: "right", stickyOffset: 36,  width: 100 },
  ];

  const totalWidth = COLUMNS.reduce((s, c) => s + c.width, 0) + 36 + 32; // +36 for actions, +32 for compare checkbox

  // Listings selected for comparison (from current filtered set)
  const compareListings = useMemo(() => {
    return (allListings ?? []).filter(l => compareIds.has(l.id));
  }, [allListings, compareIds]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <div ref={pageTopRef} />
      <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <MapPin className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Tracker Ofert Nieruchomości</h1>
            <p className="text-xs text-slate-500">{allListings.length} ofert w bazie</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 text-slate-600 border-slate-300 hover:bg-slate-100"
              onClick={handleGeocodeMissing}
              disabled={isGeocodingMissing}
              title="Geokoduj oferty bez współrzędnych (dodaj piny na mapę)"
            >
              {isGeocodingMissing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
              {isGeocodingMissing ? "Geokodowanie..." : "Geokoduj brakujące"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
              onClick={handleCheckUrls}
              disabled={checkRunning}
              title="Sprawdź które ogłoszenia są nadal aktywne (AI analizuje każdy URL)"
            >
              {checkRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {checkRunning ? "Sprawdzanie..." : "Sprawdź aktualność ofert"}
            </Button>
            <button
              onClick={() => setHelpOpen(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors border border-slate-200 hover:border-blue-200"
              title="Jak korzystać z aplikacji?"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Add listing ── */}
        <Card className="border border-blue-100 bg-blue-50/40 shadow-sm">
          <CardContent className="pt-4 pb-4 space-y-3">
            {/* Row 1: URL input */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 flex-shrink-0 w-28">
                <Plus className="w-4 h-4" />
                Dodaj ofertę
              </div>
              <Input
                className="flex-1 h-9 text-sm bg-white border-blue-200 focus:border-blue-400"
                placeholder="Wklej link do oferty (OLX, Facebook, Otodom...)"
                value={submitUrl}
                onChange={e => setSubmitUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !isSubmitting && !showDescriptionField && handleSubmit()}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowDescriptionField(v => !v)}
                className={`h-9 px-3 text-xs rounded-md border flex-shrink-0 transition-colors ${
                  showDescriptionField
                    ? "bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200"
                    : "bg-white border-blue-200 text-blue-600 hover:bg-blue-50"
                }`}
                title="Wklej opis ogłoszenia (pomocne dla Facebook i innych stron blokujących pobieranie)"
              >
                {showDescriptionField ? "✕ Ukryj opis" : "+ Dodaj opis"}
              </button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !submitUrl.trim()}
                className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex-shrink-0"
              >
                {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Analizuję...</> : "Dodaj"}
              </Button>
            </div>

            {/* FB hint */}
            {isFbUrl && !showDescriptionField && (
              <div className="ml-[calc(7rem+12px)] flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <span className="text-base leading-none mt-0.5">💡</span>
                <span>
                  <strong>Wykryto link Facebook.</strong> Facebook blokuje automatyczne pobieranie treści.
                  Dla pełnych danych kliknij <strong>"+ Dodaj opis"</strong> i wklej tekst ogłoszenia skopiowany ze strony.
                </span>
              </div>
            )}

            {/* Description textarea */}
            {showDescriptionField && (
              <div className="ml-[calc(7rem+12px)] space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  Opis ogłoszenia <span className="text-slate-400 font-normal">(opcjonalnie — wklej treść ze strony ogłoszenia)</span>
                </label>
                <textarea
                  className="w-full h-28 text-sm rounded-md border border-blue-200 bg-white px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 placeholder:text-slate-400"
                  placeholder={isFbUrl
                    ? "Wklej tutaj treść ogłoszenia z Facebook (tytuł, opis, cena, lokalizacja)..."
                    : "Wklej tutaj treść ogłoszenia jeśli strona nie dała się automatycznie odczytać..."
                  }
                  value={submitDescription}
                  onChange={e => setSubmitDescription(e.target.value)}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-slate-400">
                  AI użyje tego opisu jako główne źródło danych. Im więcej szczegółów (cena, lokalizacja, rozmiar, media), tym dokładniejsza ekstrakcja.
                </p>
              </div>
            )}

            {!showDescriptionField && (
              <p className="text-xs text-blue-600/70 ml-[calc(7rem+12px)]">
                AI automatycznie wyciągnie dane: województwo, powiat, gmina, miejscowość, rozmiar działki, media, przeznaczenie, zabudowania, cena
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Filters + Legend ── */}
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1 min-w-[150px]">
                <label className="text-xs font-medium text-slate-600">Województwo</label>
                <Select value={filterWoj || "__all__"} onValueChange={v => setFilterWoj(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wszystkie" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Wszystkie</SelectItem>
                    {uniqueWoj.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1 min-w-[150px]">
                <label className="text-xs font-medium text-slate-600">Przeznaczenie</label>
                <Select value={filterPrz || "__all__"} onValueChange={v => setFilterPrz(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wszystkie" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Wszystkie</SelectItem>
                    {uniquePrz.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1 min-w-[150px]">
                <label className="text-xs font-medium text-slate-600">Min. ocena</label>
                <Select value={String(minRating)} onValueChange={v => setMinRating(Number(v))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Wszystkie</SelectItem>
                    <SelectItem value="3">★★★ 3+</SelectItem>
                    <SelectItem value="4">★★★★ 4+</SelectItem>
                    <SelectItem value="5">★★★★★ tylko 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <label className="text-xs font-medium text-slate-600">Szukaj</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    className="h-8 pl-8 text-sm"
                    placeholder="Miejscowość, gmina, media, przeznaczenie, ID..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {hasFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="h-8 text-xs">
                  Wyczyść filtry
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-500 font-medium">
                Wyświetlane: <span className="text-blue-600 font-bold">{filtered.length}</span> / {allListings.length}
              </span>
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs font-medium">
                  🟢 do 300k <span className="ml-1 bg-green-200 text-green-900 px-1 rounded">{counts.green}</span>
                </Badge>
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs font-medium">
                  🟡 300–400k <span className="ml-1 bg-yellow-200 text-yellow-900 px-1 rounded">{counts.yellow}</span>
                </Badge>
                <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs font-medium">
                  🟠 400k+ <span className="ml-1 bg-orange-200 text-orange-900 px-1 rounded">{counts.orange}</span>
                </Badge>
              </div>
              {/* Flagged filter chip */}
              <button
                onClick={() => setFilterFlagged(v => !v)}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${
                  filterFlagged
                    ? "bg-yellow-400 text-yellow-900 border-yellow-500 shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:border-yellow-400 hover:text-yellow-700"
                }`}
                title={filterFlagged ? "Kliknij aby pokazać wszystkie" : "Pokaż tylko oferty oznaczone 'do kontaktu'"}
              >
                <Flag className="w-3 h-3" fill={filterFlagged ? "currentColor" : "none"} />
                Tylko oflagowane
                {filterFlagged && (
                  <span className="ml-0.5 bg-yellow-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                    {filtered.length}
                  </span>
                )}
              </button>

              {selectedId && (
                <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Zaznaczono: #{selectedId}
                  <button className="ml-1 text-slate-400 hover:text-slate-600" onClick={() => setSelectedId(null)} title="Odznacz">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Map ── */}
        <Card className="border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-[420px] md:h-[500px]">
            <MapView initialCenter={{ lat: 52.0, lng: 19.5 }} initialZoom={6} onMapReady={handleMapReady} className="w-full h-full" />
          </div>
        </Card>

        {/* ── Table ── */}
        {/* ── Stats bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-0.5">Aktywne oferty</p>
            <p className="text-xl font-bold text-slate-800">{activeListings.length}</p>
            {archivedListings.length > 0 && <p className="text-[10px] text-slate-400">{archivedListings.length} zarchiwizowanych</p>}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-0.5">Do kontaktu</p>
            <p className="text-xl font-bold text-yellow-600">{stats.flaggedCount}</p>
            <p className="text-[10px] text-slate-400">oflagowanych</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-0.5">Średnia cena</p>
            <p className="text-xl font-bold text-slate-800">
              {stats.avgPrice !== null ? `${(stats.avgPrice / 1000).toFixed(0)} tys.` : "—"}
            </p>
            <p className="text-[10px] text-slate-400">zł (aktywne)</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-0.5">Najcz. województwo</p>
            <p className="text-sm font-bold text-slate-800 truncate">{stats.topWoj ?? "—"}</p>
            <p className="text-[10px] text-slate-400">najwięcej ofert</p>
          </div>
        </div>

        <div ref={tableContainerRef}>
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                Tabela ofert ({filtered.length})
                {selectedId && <span className="text-xs font-normal text-slate-400">— kliknij poza tabelą aby odznaczyć</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={tableScrollRef} className="overflow-x-auto relative">
                <table className="w-full text-xs border-collapse" style={{ minWidth: `${totalWidth}px`, tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "32px" }} />
                    {COLUMNS.map(col => <col key={col.key} style={{ width: `${col.width}px` }} />)}
                    <col style={{ width: "36px" }} />
                  </colgroup>

                  {/* ── Header row ── */}
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {/* Compare checkbox header — select all filtered */}
                      <th className="px-1 py-2" style={{ position: "sticky", left: 0, zIndex: 11, background: "#f8fafc", width: "32px" }}>
                        <Checkbox
                          checked={filtered.length > 0 && filtered.every(l => compareIds.has(l.id))}
                          onCheckedChange={checked => {
                            setCompareIds(prev => {
                              const next = new Set(prev);
                              if (checked) { filtered.forEach(l => next.add(l.id)); }
                              else { filtered.forEach(l => next.delete(l.id)); }
                              return next;
                            });
                          }}
                          title={filtered.every(l => compareIds.has(l.id)) ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
                          className="w-3.5 h-3.5"
                        />
                      </th>
                      {COLUMNS.map(col => {
                        const isSticky = !!col.sticky;
                        const stickyStyle: React.CSSProperties = isSticky ? {
                          position: "sticky",
                          [col.sticky === "left" ? "left" : "right"]: col.stickyOffset ?? 0,
                          zIndex: 10,
                          background: "#f8fafc",
                          boxShadow: col.sticky === "left" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : "-2px 0 4px -1px rgba(0,0,0,0.08)",
                        } : {};
                        return (
                          <th key={col.key} className="text-left font-semibold text-slate-600 px-2 py-2" style={{ ...stickyStyle }}>
                            {col.sortable ? (
                              <button className="flex items-center gap-1 hover:text-slate-900 transition-colors whitespace-nowrap" onClick={() => toggleSort(col.key as SortKey)}>
                                {col.label} <SortIcon col={col.key as SortKey} />
                              </button>
                            ) : (
                              <span className="whitespace-nowrap">{col.label}</span>
                            )}
                          </th>
                        );
                      })}
                      {/* Actions header — sticky right:0 */}
                      <th className="px-2 py-2" style={{ position: "sticky", right: 0, zIndex: 10, background: "#f8fafc", boxShadow: "-2px 0 4px -1px rgba(0,0,0,0.08)", width: "36px" }} />
                    </tr>

                    {/* ── Column filter row ── */}
                    <tr className="bg-white border-b border-slate-100">
                      {/* Empty cell for compare checkbox column */}
                      <td className="px-1 py-1" style={{ position: "sticky", left: 0, zIndex: 10, background: "white", width: "32px" }} />
                      {COLUMNS.map(col => {
                        const isSticky = !!col.sticky;
                        const stickyStyle: React.CSSProperties = isSticky ? {
                          position: "sticky",
                          [col.sticky === "left" ? "left" : "right"]: col.stickyOffset ?? 0,
                          zIndex: 10,
                          background: "white",
                          boxShadow: col.sticky === "left" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : "-2px 0 4px -1px rgba(0,0,0,0.08)",
                        } : {};

                        if (!col.filterable) {
                          return <td key={col.key} className="px-2 py-1" style={stickyStyle} />;
                        }

                        const filterVal = colFilters[col.key] ?? "";

                        if (col.filterType === "select" && col.filterOptions) {
                          return (
                            <td key={col.key} className="px-1 py-1" style={stickyStyle}>
                              <select
                                className="w-full text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:border-blue-400"
                                value={filterVal}
                                onChange={e => setColFilters(f => ({ ...f, [col.key]: e.target.value }))}
                              >
                                <option value="">Wszystkie</option>
                                {col.filterOptions.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </td>
                          );
                        }

                        return (
                          <td key={col.key} className="px-1 py-1" style={stickyStyle}>
                            <div className="relative">
                              <input
                                className="w-full text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-blue-400 pr-4"
                                placeholder={col.key === "cena" ? "np. 100-300" : "filtruj..."}
                                value={filterVal}
                                onChange={e => setColFilters(f => ({ ...f, [col.key]: e.target.value }))}
                              />
                              {filterVal && (
                                <button className="absolute right-0.5 top-0.5 text-slate-300 hover:text-slate-500" onClick={() => setColFilters(f => ({ ...f, [col.key]: "" }))}>
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1" style={{ position: "sticky", right: 0, zIndex: 10, background: "white", boxShadow: "-2px 0 4px -1px rgba(0,0,0,0.08)", width: "36px" }} />
                    </tr>
                  </thead>

                  {/* ── Body ── */}
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={COLUMNS.length + 2} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" /></td></tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={COLUMNS.length + 2} className="py-14">
                          <div className="flex flex-col items-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                              <Search className="w-5 h-5 text-slate-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-600 mb-1">Brak ofert spełniających kryteria</p>
                              <p className="text-xs text-slate-400">
                                {hasFilters ? (
                                  <>
                                    Spróbuj zmienić filtry lub{" "}
                                    <button
                                      className="text-blue-500 hover:text-blue-700 underline underline-offset-2"
                                      onClick={clearFilters}
                                    >
                                      wyczyść wszystkie filtry
                                    </button>
                                  </>
                                ) : (
                                  "Wklej link do ogłoszenia w polu powyżej, aby dodać pierwszą ofertę."
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filtered.map(listing => {
                        const isSelected = selectedId === listing.id;
                        const isHovered = hoveredId === listing.id && !isSelected;
                        const rowStyle = getRowTint(listing.cena, isSelected, isHovered);
                        const priceColor = getPriceColor(listing.cena);
                        const tier = getPriceTier(listing.cena);

                        const stickyBg = isSelected ? "#dbeafe"
                          : isHovered ? (tier === "green" ? "#f0fdf4" : tier === "yellow" ? "#fefce8" : tier === "orange" ? "#fff7ed" : "#f8fafc")
                          : (tier === "green" ? "#f0fdf480" : tier === "yellow" ? "#fefce880" : tier === "orange" ? "#fff7ed80" : "white");

                        const isCompared = compareIds.has(listing.id);

                        const flaggedStyle = listing.flagged
                          ? { boxShadow: "inset 3px 0 0 #eab308" }
                          : {};

                        return (
                          <tr
                            key={listing.id}
                            ref={el => { if (el) rowRefs.current.set(listing.id, el); else rowRefs.current.delete(listing.id); }}
                            style={{ ...rowStyle, ...flaggedStyle }}
                            className="cursor-pointer transition-colors border-b border-slate-100 last:border-0"
                            onClick={() => {
                              if (selectedId === listing.id) { setSelectedId(null); return; }
                              setSelectedId(listing.id);
                              const marker = markersRef.current.get(listing.id);
                              if (marker && mapRef.current) {
                                const pos = marker.position;
                                if (pos) { mapRef.current.panTo(pos); mapRef.current.setZoom(12); showInfoWindow(listing, marker); }
                              }
                            }}
                            onDoubleClick={() => {
                              // Double-click: scroll to map and open info window
                              const marker = markersRef.current.get(listing.id);
                              if (marker && mapRef.current) {
                                const pos = marker.position;
                                if (pos) {
                                  mapRef.current.panTo(pos);
                                  mapRef.current.setZoom(13);
                                  showInfoWindow(listing, marker);
                                }
                              }
                              pageTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            onMouseEnter={() => setHoveredId(listing.id)}
                            onMouseLeave={() => setHoveredId(null)}
                          >
                            {/* Compare checkbox — sticky left:0 */}
                            <td className="px-1 py-2" style={{ position: "sticky", left: 0, zIndex: 5, background: stickyBg, width: "32px" }}>
                              <Checkbox
                                checked={isCompared}
                                onCheckedChange={() => {}}
                                onClick={e => toggleCompare(listing.id, e as React.MouseEvent)}
                                className="w-3.5 h-3.5"
                              />
                            </td>

                            {/* ID — sticky left:32 */}
                            <td className="px-2 py-2 font-bold text-slate-800 whitespace-nowrap" style={{ position: "sticky", left: 32, zIndex: 5, background: stickyBg, boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>
                              {isSelected && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 mb-0.5" style={{ background: priceColor }} />}
                              {listing.id}
                            </td>

                            {/* URL */}
                            <td className="px-2 py-2">
                              <a href={listing.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              </a>
                            </td>

                            {/* Województwo — double-click to edit */}
                            <td className="px-2 py-2 text-slate-700 truncate" title={listing.wojewodztwo}>
                              <InlineCell id={listing.id} field="wojewodztwo" value={listing.wojewodztwo} />
                            </td>
                            {/* Powiat */}
                            <td className="px-2 py-2 text-slate-600 truncate" title={listing.powiat}>
                              <InlineCell id={listing.id} field="powiat" value={listing.powiat} />
                            </td>
                            {/* Gmina */}
                            <td className="px-2 py-2 text-slate-600 truncate" title={listing.gmina}>
                              <InlineCell id={listing.id} field="gmina" value={listing.gmina} />
                            </td>
                            {/* Miejscowość */}
                            <td className="px-2 py-2 font-medium text-slate-800 truncate" title={listing.miejscowosc}>
                              <InlineCell id={listing.id} field="miejscowosc" value={listing.miejscowosc} />
                            </td>
                            {/* Rozmiar działki */}
                            <td className="px-2 py-2 text-slate-600 whitespace-nowrap">
                              <InlineCell id={listing.id} field="rozmiarDzialki" value={listing.rozmiarDzialki} />
                            </td>
                            {/* Media — wraps */}
                            <td className="px-2 py-2 text-slate-600" style={{ whiteSpace: "normal", lineHeight: "1.4" }}>
                              <InlineCell id={listing.id} field="media" value={listing.media} />
                            </td>
                            {/* Przeznaczenie */}
                            <td className="px-2 py-2">
                              <InlineCell id={listing.id} field="przeznaczenie" value={listing.przeznaczenie} />
                            </td>
                            {/* Zabudowania — wraps */}
                            <td className="px-2 py-2 text-slate-600" style={{ whiteSpace: "normal", lineHeight: "1.4" }}>
                              <InlineCell id={listing.id} field="zabudowania" value={listing.zabudowania} />
                            </td>

                            {/* Notes — editable */}
                            <td className="px-2 py-2" style={{ whiteSpace: "normal" }}>
                              <NotesCell listingId={listing.id} notes={listing.notes} onSave={handleSaveNotes} />
                            </td>

                            {/* Avg Rating — star widget */}
                            <td className="px-2 py-2">
                              <StarRating listingId={listing.id} stats={ratingStats[listing.id]} onRate={handleRate} />
                            </td>

                            {/* Cena — sticky right, double-click to edit */}
                            <td className="px-2 py-2 whitespace-nowrap" style={{ position: "sticky", right: 36, zIndex: 5, background: stickyBg, boxShadow: "-2px 0 4px -1px rgba(0,0,0,0.08)" }}>
                              <span className="font-bold text-sm" style={{ color: priceColor }}>
                                <InlineCell id={listing.id} field="cena" value={listing.cena} />
                              </span>
                            </td>

                            {/* Actions — sticky right:0 */}
                            <td className="px-1 py-2" style={{ position: "sticky", right: 0, zIndex: 5, background: stickyBg, boxShadow: "-2px 0 4px -1px rgba(0,0,0,0.08)", width: "60px" }}>
                              <div className="flex items-center gap-1">
                                {/* Flag button */}
                                <button
                                  className={`transition-colors ${
                                    listing.flagged
                                      ? "text-yellow-500 hover:text-yellow-600"
                                      : "text-slate-200 hover:text-yellow-400"
                                  }`}
                                  onClick={e => { e.stopPropagation(); handleToggleFlag(listing); }}
                                  title={listing.flagged ? "Usuń flagę 'do kontaktu'" : "Oznacz jako 'do kontaktu'"}
                                >
                                  <Flag className="w-3.5 h-3.5" fill={listing.flagged ? "currentColor" : "none"} />
                                </button>
                                <button className="text-slate-300 hover:text-red-500 transition-colors" onClick={e => { e.stopPropagation(); handleDelete(listing.id); }} title="Usuń ofertę">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Archived listings section ── */}
        {archivedListings.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 bg-slate-100 hover:bg-slate-150 transition-colors text-left"
              onClick={() => setArchivedExpanded(v => !v)}
            >
              <Archive className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-slate-500">Archiwizowane</span>
              <span className="ml-1 text-xs bg-slate-300 text-slate-600 rounded-full px-2 py-0.5 font-medium">{archivedListings.length}</span>
              <span className="ml-auto text-xs text-slate-400">{archivedExpanded ? "Zwiń" : "Rozwiń"}</span>
              {archivedExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {archivedExpanded && (
              <div className="overflow-x-auto bg-white">
                <table className="w-full text-xs border-collapse" style={{ minWidth: "700px" }}>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-2 text-slate-400 font-medium w-10">ID</th>
                      <th className="text-left px-3 py-2 text-slate-400 font-medium">Miejscowość</th>
                      <th className="text-left px-3 py-2 text-slate-400 font-medium">Województwo</th>
                      <th className="text-left px-3 py-2 text-slate-400 font-medium">Rozmiar działki</th>
                      <th className="text-left px-3 py-2 text-slate-400 font-medium">Przeznaczenie</th>
                      <th className="text-left px-3 py-2 text-slate-400 font-medium">Cena</th>
                      <th className="text-left px-3 py-2 text-slate-400 font-medium w-24">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedListings.map(listing => (
                      <tr key={listing.id} className="border-b border-slate-100 last:border-0 opacity-60 hover:opacity-80 transition-opacity">
                        <td className="px-3 py-2 font-bold text-slate-400">{listing.id}</td>
                        <td className="px-3 py-2 text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <span>{listing.miejscowosc}</span>
                            <a href={listing.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600" onClick={e => e.stopPropagation()}>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-400">{listing.wojewodztwo}</td>
                        <td className="px-3 py-2 text-slate-400">{listing.rozmiarDzialki}</td>
                        <td className="px-3 py-2 text-slate-400">{listing.przeznaczenie}</td>
                        <td className="px-3 py-2 text-slate-400">{listing.cena}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-600 transition-colors px-1.5 py-0.5 rounded border border-blue-200 hover:border-blue-400"
                              onClick={() => handleUnarchive(listing.id)}
                              title="Przywróć do aktywnych"
                            >
                              <RotateCcw className="w-3 h-3" /> Przywróć
                            </button>
                            <button
                              className="flex items-center gap-1 text-[10px] text-red-300 hover:text-red-500 transition-colors px-1.5 py-0.5 rounded border border-red-200 hover:border-red-400"
                              onClick={() => handleDelete(listing.id)}
                              title="Usuń na stałe"
                            >
                              <Trash2 className="w-3 h-3" /> Usuń
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Floating compare bar ── */}
        {compareIds.size > 0 && (
          <div
            className="fixed z-[10001] flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-xl"
            style={{
              bottom: "28px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "linear-gradient(135deg, #1e40af 0%, #2563eb 100%)",
              boxShadow: "0 8px 32px rgba(37,99,235,0.45)",
            }}
          >
            <GitCompareArrows className="w-4 h-4 text-white flex-shrink-0" />
            <span className="text-white text-sm font-semibold">
              {compareIds.size} {compareIds.size === 1 ? "oferta" : compareIds.size < 5 ? "oferty" : "ofert"} zaznaczone
            </span>
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-white text-blue-700 hover:bg-blue-50 font-semibold"
              onClick={() => setCompareOpen(true)}
            >
              Porównaj
            </Button>
            <button
              className="text-blue-200 hover:text-white text-xs ml-1 transition-colors"
              onClick={() => setCompareIds(new Set())}
              title="Wyczyść zaznaczenie"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Compare Sheet panel ── */}
        <Sheet open={compareOpen} onOpenChange={setCompareOpen}>
          <SheetContent
            side="right"
            className="w-full overflow-y-auto p-0"
            style={{ maxWidth: `${Math.min(compareListings.length * 280 + 40, 1200)}px` }}
          >
            <SheetHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <SheetTitle className="flex items-center gap-2 text-slate-800">
                <GitCompareArrows className="w-5 h-5 text-blue-600" />
                Porównanie ofert ({compareListings.length})
              </SheetTitle>
            </SheetHeader>

            <div className="p-4 overflow-x-auto">
              {compareListings.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-12">Brak zaznaczonych ofert</p>
              ) : (
                <table className="w-full text-xs border-collapse" style={{ minWidth: `${compareListings.length * 260}px` }}>
                  <colgroup>
                    <col style={{ width: "130px" }} />
                    {compareListings.map(l => <col key={l.id} style={{ width: "260px" }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="text-left text-slate-500 font-medium px-3 py-2 bg-slate-50 border-b border-slate-200">Pole</th>
                      {compareListings.map(l => {
                        const color = getPriceColor(l.cena);
                        const tier = getPriceTier(l.cena);
                        const tierBg = tier === "green" ? "#f0fdf4" : tier === "yellow" ? "#fefce8" : tier === "orange" ? "#fff7ed" : "#f8fafc";
                        return (
                          <th key={l.id} className="px-3 py-2 border-b border-slate-200 text-left" style={{ background: tierBg }}>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0" style={{ background: color }}>{l.id}</div>
                              <span className="font-bold text-slate-800 text-sm">{l.miejscowosc || "-"}</span>
                            </div>
                            <div className="text-[11px] text-slate-500">{l.gmina}, {l.powiat}</div>
                            <div className="mt-1 flex items-center gap-2">
                              <a
                                href={l.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-700 flex items-center gap-1 text-[11px]"
                                onClick={e => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3" /> Ogłoszenie
                              </a>
                              <button
                                className="text-slate-400 hover:text-blue-600 flex items-center gap-1 text-[11px] transition-colors"
                                onClick={() => {
                                  setCompareOpen(false);
                                  setSelectedId(l.id);
                                  const marker = markersRef.current.get(l.id);
                                  if (marker && mapRef.current) {
                                    const pos = marker.position;
                                    if (pos) { mapRef.current.panTo(pos); mapRef.current.setZoom(13); showInfoWindow(l, marker); }
                                  }
                                  pageTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }}
                              >
                                <MapPin className="w-3 h-3" /> Mapa
                              </button>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { label: "Województwo", render: (l: Listing) => l.wojewodztwo },
                      { label: "Powiat",       render: (l: Listing) => l.powiat },
                      { label: "Gmina",        render: (l: Listing) => l.gmina },
                      { label: "Miejscowość",  render: (l: Listing) => l.miejscowosc },
                      { label: "Rozmiar działki", render: (l: Listing) => l.rozmiarDzialki },
                      { label: "Media",        render: (l: Listing) => l.media },
                      { label: "Przeznaczenie", render: (l: Listing) => l.przeznaczenie },
                      { label: "Zabudowania",  render: (l: Listing) => l.zabudowania },
                      { label: "Notatki",      render: (l: Listing) => l.notes },
                      {
                        label: "Ocena",
                        render: (l: Listing) => {
                          const s = ratingStats[l.id];
                          return s ? `★ ${s.avg.toFixed(1)} (${s.count})` : "—";
                        },
                      },
                      {
                        label: "Cena",
                        render: (l: Listing) => l.cena,
                        isPrice: true,
                      },
                    ] as { label: string; render: (l: Listing) => string | null | undefined; isPrice?: boolean }[]).map((row, ri) => (
                      <tr key={row.label} className={ri % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                        <td className="px-3 py-2 font-medium text-slate-600 border-r border-slate-100 whitespace-nowrap">{row.label}</td>
                        {compareListings.map(l => {
                          const val = row.render(l);
                          const color = row.isPrice ? getPriceColor(l.cena) : undefined;
                          return (
                            <td key={l.id} className="px-3 py-2 text-slate-700 border-r border-slate-100" style={{ whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
                              {row.isPrice ? (
                                <span className="font-bold text-sm" style={{ color }}>{val || "—"}</span>
                              ) : (
                                val || <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center bg-slate-50">
              <button
                className="text-sm text-slate-500 hover:text-red-500 transition-colors flex items-center gap-1"
                onClick={() => { setCompareIds(new Set()); setCompareOpen(false); }}
              >
                <X className="w-4 h-4" /> Wyczyść zaznaczenie
              </button>
              <Button variant="outline" size="sm" onClick={() => setCompareOpen(false)}>Zamknij</Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Activity check dialog ── */}
        <Dialog open={checkDialogOpen} onOpenChange={open => { if (!checkRunning) setCheckDialogOpen(open); }}>
          <DialogContent className="max-w-2xl w-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
                Sprawdzanie aktywności ogłoszeń
              </DialogTitle>
            </DialogHeader>

            {/* Initial state: show start button */}
            {!checkRunning && checkResults.length === 0 && (
              <div className="py-6 text-center space-y-4">
                <p className="text-sm text-slate-600">Sprawdzisz <span className="font-bold text-slate-800">{activeListings.length}</span> aktywnych ogloszen</p>
                <Button
                  onClick={handleCheckUrls}
                  className="gap-2 bg-amber-600 hover:bg-amber-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  Rozpoczac sprawdzanie
                </Button>
              </div>
            )}

            {/* Progress / running state */}
            {checkRunning && (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  <span>AI analizuje każdy URL… Proszę czekać, może to potrwać kilka minut.</span>
                </div>
                <Progress value={checkProgress} className="h-2" />
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Sprawdzono {checkDone} z {activeListings.length} ofert</span>
                  {checkCurrentUrl && (
                    <span className="truncate max-w-xs text-slate-300" title={checkCurrentUrl}>
                      {checkCurrentUrl.length > 60 ? checkCurrentUrl.slice(0, 57) + "…" : checkCurrentUrl}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Results */}
            {!checkRunning && checkResults.length > 0 && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5 text-green-700 font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    {checkResults.filter(r => r.active).length} aktywnych
                  </span>
                  <span className="flex items-center gap-1.5 text-red-600 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    {checkResults.filter(r => !r.active).length} nieaktywnych
                  </span>
                </div>

                {/* Inactive list */}
                {checkResults.filter(r => !r.active).length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nieaktywne ogłoszenia</p>
                    <div className="max-h-64 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2">
                      {checkResults.filter(r => !r.active).map(r => (
                        <div key={r.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-slate-50">
                          <Checkbox
                            checked={selectedInactive.has(r.id)}
                            onCheckedChange={checked => {
                              setSelectedInactive(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(r.id); else next.delete(r.id);
                                return next;
                              });
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-600 text-xs">#{r.id}</span>
                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 flex items-center gap-1 text-xs truncate">
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{r.url}</span>
                              </a>
                            </div>
                            <p className="text-[11px] text-red-500 mt-0.5">{r.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all-inactive"
                        checked={selectedInactive.size === checkResults.filter(r => !r.active).length}
                        onCheckedChange={checked => {
                          if (checked) setSelectedInactive(new Set(checkResults.filter(r => !r.active).map(r => r.id)));
                          else setSelectedInactive(new Set());
                        }}
                      />
                      <label htmlFor="select-all-inactive" className="text-xs text-slate-500 cursor-pointer">Zaznacz wszystkie nieaktywne</label>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3">
                    <ShieldCheck className="w-5 h-5" />
                    <span className="text-sm font-medium">Wszystkie ogłoszenia są aktywne!</span>
                  </div>
                )}
              </div>
            )}

            {/* Footer - show when results available */}
            {checkResults.length > 0 && (
              <DialogFooter className="flex flex-wrap gap-2 justify-between items-center pt-4 border-t">
                <div className="flex gap-2 flex-wrap">
                  {selectedInactive.size > 0 ? (
                    <>
                      <Button
                        size="sm"
                        className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={handleArchiveSelected}
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Archiwizuj zaznaczone ({selectedInactive.size})
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1.5"
                        onClick={handleDeleteSelected}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Usun zaznaczone ({selectedInactive.size})
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">Zaznacz oferty aby je zarchiwizowac lub usunac</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setCheckDialogOpen(false); setCheckResults([]); }}
                  disabled={checkRunning}
                >
                  Zamknij
                </Button>
              </DialogFooter>
            )}

          </DialogContent>
        </Dialog>

        {/* ── Help / Tutorial Dialog ── */}
        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
            <div className="bg-gradient-to-br from-blue-50 to-slate-50 px-6 pt-6 pb-4">
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                    <MapPin className="w-3.5 h-3.5 text-white" />
                  </div>
                  <DialogTitle className="text-base font-semibold text-slate-800">Jak korzystać z aplikacji?</DialogTitle>
                </div>
                <DialogDescription className="text-xs text-slate-500">
                  Krótki przewodnik po najważniejszych funkcjach — wszystko w jednym miejscu.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">

              {/* Step 1 */}
              <div className="flex gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Plus className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-0.5">Dodaj ofertę</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Wklej link z OLX, Otodom, Facebook lub innego serwisu — AI automatycznie wyciągnie wszystkie dane: lokalizację, cenę, media i przeznaczenie.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <Flag className="w-4 h-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-0.5">Oznacz ‚do kontaktu” 🚩</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Kliknij ikonę flagi w wierszu, aby wydzielić najciekawsze oferty. Pojawi się żółty pasek i pinezka na mapie. Filtr ‚Tylko oflagowane’ pozwala skupić się tylko na nich.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Star className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-0.5">Oceniaj działki ★★★★★</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Każda oferta ma widget gwiazdek — kliknij aby ocenić od 1 do 5. Możesz filtrować po minimalnej ocenie, co ułatwia wybór najlepszych kandydatów.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <GitCompareArrows className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-0.5">Porównaj oferty obok siebie</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Zaznacz checkboxy przy kilku ofertach — pojawi się pasek na dole. Kliknij ‚Porównaj’, aby zobaczyć zestawienie wszystkich parametrów w jednym widoku.
                  </p>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <RefreshCw className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-0.5">Sprawdź aktualność ofert</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Przycisk ‚Sprawedź aktualność ofert’ w nagłówku sprawdza każdy link. Nieaktywne ogłoszenia możesz zarchiwizować lub usunąć jednym kliknięciem.
                  </p>
                </div>
              </div>

              {/* Step 6 */}
              <div className="flex gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Search className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-0.5">Filtruj i szukaj</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Filtruj po województwie, przeznaczeniu, cenie i ocenie. Wyszukiwarka rozumie synonimy (np. ‚budowlana’ → ‚MN’). W każdej kolumnie tabeli jest dodatkowe pole filtrowania.
                  </p>
                </div>
              </div>

              {/* Step 7 */}
              <div className="flex gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-0.5">Mapa interaktywna</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Kliknij pinezkę na mapie, aby zaznaczyć ofertę w tabeli. Kliknij wiersz w tabeli, aby wycentrować mapę. Dwuklik otwiera okno z detalami.
                  </p>
                </div>
              </div>

            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white">
              <Button
                className="w-full h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                onClick={() => setHelpOpen(false)}
              >
                Rozumiem, zaczynamy! 🚀
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Back to top button ── */}
        {showBackToTop && (
          <button
            onClick={() => pageTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="fixed bottom-6 right-6 z-[10000] w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            title="Wróć do góry"
            style={{ boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        )}

        {/* ── Fixed mirror scrollbar ── */}
        <div
          ref={mirrorScrollRef}
          className="overflow-x-auto"
          style={{
            position: "fixed",
            bottom: 0,
            zIndex: 9999,
            background: "white",
            borderTop: "2px solid #cbd5e1",
            height: "16px",
            display: showScrollbar ? "block" : "none",
          }}
        >
          <div ref={mirrorInnerRef} style={{ height: "1px" }} />
        </div>

      </div>
    </div>
  );
}
