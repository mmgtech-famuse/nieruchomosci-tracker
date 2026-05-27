import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapView } from "@/components/Map";
import { toast } from "sonner";
import {
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  Search,
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

  // URL submission
  const [submitUrl, setSubmitUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Map refs
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [mapReady, setMapReady] = useState(false);

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

  // Filtered + sorted listings
  const filtered = useMemo(() => {
    let items = allListings.filter(l => {
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
      return true;
    });
    return sortListings(items, sortKey, sortDir, ratingStats);
  }, [allListings, filterWoj, filterPrz, search, colFilters, minRating, sortKey, sortDir, ratingStats]);

  // Price tier counts
  const counts = useMemo(() => {
    const c = { green: 0, yellow: 0, orange: 0, unknown: 0 };
    filtered.forEach(l => { c[getPriceTier(l.cena)]++; });
    return c;
  }, [filtered]);

  const hasFilters = !!(filterWoj || filterPrz || search || Object.values(colFilters).some(Boolean) || minRating > 0);

  function clearFilters() {
    setFilterWoj(""); setFilterPrz(""); setSearch("");
    setColFilters({}); setMinRating(0);
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
        existing.content = createPinElement(listing.id, color, scale, isActive);
        existing.zIndex = isActive ? 999 : listing.id;
        return;
      }

      const markerEl = createPinElement(listing.id, color, scale, isActive);
      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat, lng },
        map: mapRef.current,
        title: `${listing.id}: ${listing.miejscowosc}`,
        content: markerEl,
        zIndex: isActive ? 999 : listing.id,
      });

      marker.addListener("gmp-click", () => {
        setSelectedId(listing.id);
        showInfoWindow(listing, marker);
        scrollToRow(listing.id);
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
      marker.content = createPinElement(id, color, isActive ? 1.45 : 1, isActive);
      marker.zIndex = isActive ? 999 : id;
    });
  }, [activeMapId, allListings]);

  function createPinElement(id: number, color: string, scale: number, isActive: boolean): HTMLElement {
    const size = Math.round(28 * scale);
    const fontSize = Math.round(11 * scale);
    const el = document.createElement("div");
    el.style.cssText = `width:${size}px;height:${size}px;background:${color};border:${isActive ? "3px" : "2px"} solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:bold;color:white;cursor:pointer;box-shadow:${isActive ? `0 0 0 3px ${color}66,0 4px 12px rgba(0,0,0,0.4)` : "0 2px 6px rgba(0,0,0,0.35)"};transition:transform 0.15s ease;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;user-select:none;`;
    el.textContent = String(id);
    return el;
  }

  function showInfoWindow(listing: Listing, marker: google.maps.marker.AdvancedMarkerElement) {
    if (!infoWindowRef.current) return;
    const color = getPriceColor(listing.cena);
    const stats = ratingStats[listing.id];
    const starsHtml = stats ? `<span style="color:#f59e0b">★</span> ${stats.avg.toFixed(1)} <span style="color:#94a3b8">(${stats.count})</span>` : "";
    infoWindowRef.current.setContent(`
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-width:200px;padding:4px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:28px;height:28px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;flex-shrink:0;">${listing.id}</div>
          <div>
            <div style="font-weight:600;font-size:14px;">${listing.miejscowosc}</div>
            <div style="font-size:11px;color:#64748b;">${listing.gmina}, ${listing.powiat}</div>
          </div>
        </div>
        <div style="font-size:15px;font-weight:700;color:${color};margin-bottom:4px;">${listing.cena}</div>
        ${listing.przeznaczenie !== "-" ? `<div style="font-size:11px;color:#475569;margin-bottom:4px;">${listing.przeznaczenie}</div>` : ""}
        ${starsHtml ? `<div style="font-size:12px;margin-bottom:6px;">${starsHtml}</div>` : ""}
        <a href="${listing.url}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#3b82f6;text-decoration:none;">🔗 Otwórz ogłoszenie</a>
      </div>
    `);
    infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
  }

  function scrollToRow(id: number) {
    const el = rowRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!submitUrl.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({ url: submitUrl.trim() });
      await refetch();
      setSubmitUrl("");
      const meta = (result as { _meta?: { fetchSuccess: boolean; geocoded: boolean } })._meta;
      if (meta?.fetchSuccess) {
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
      toast.error("Błąd podczas dodawania", { description: msg });
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

  const totalWidth = COLUMNS.reduce((s, c) => s + c.width, 0) + 36; // +36 for actions

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
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
          </div>
        </div>

        {/* ── Add listing ── */}
        <Card className="border border-blue-100 bg-blue-50/40 shadow-sm">
          <CardContent className="pt-4 pb-4">
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
                onKeyDown={e => e.key === "Enter" && !isSubmitting && handleSubmit()}
                disabled={isSubmitting}
              />
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !submitUrl.trim()}
                className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex-shrink-0"
              >
                {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Analizuję...</> : "Dodaj"}
              </Button>
            </div>
            <p className="text-xs text-blue-600/70 mt-2 ml-[calc(7rem+12px)]">
              AI automatycznie wyciągnie dane: województwo, powiat, gmina, miejscowość, rozmiar działki, media, przeznaczenie, zabudowania, cena
            </p>
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
                    {COLUMNS.map(col => <col key={col.key} style={{ width: `${col.width}px` }} />)}
                    <col style={{ width: "36px" }} />
                  </colgroup>

                  {/* ── Header row ── */}
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
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
                      <tr><td colSpan={COLUMNS.length + 1} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" /></td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={COLUMNS.length + 1} className="text-center text-slate-400 py-12 text-sm">Brak ofert spełniających kryteria</td></tr>
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

                        return (
                          <tr
                            key={listing.id}
                            ref={el => { if (el) rowRefs.current.set(listing.id, el); else rowRefs.current.delete(listing.id); }}
                            style={rowStyle}
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
                            onMouseEnter={() => setHoveredId(listing.id)}
                            onMouseLeave={() => setHoveredId(null)}
                          >
                            {/* ID — sticky left */}
                            <td className="px-2 py-2 font-bold text-slate-800 whitespace-nowrap" style={{ position: "sticky", left: 0, zIndex: 5, background: stickyBg, boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>
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
                            <td className="px-1 py-2" style={{ position: "sticky", right: 0, zIndex: 5, background: stickyBg, boxShadow: "-2px 0 4px -1px rgba(0,0,0,0.08)", width: "36px" }}>
                              <button className="text-slate-300 hover:text-red-500 transition-colors" onClick={e => { e.stopPropagation(); handleDelete(listing.id); }} title="Usuń ofertę">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
