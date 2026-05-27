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
  Trash2,
  X,
} from "lucide-react";
import type { Listing } from "@shared/types";

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

/** Returns subtle row background tint + left border color based on price tier */
function getRowTint(cena: string, isSelected: boolean, isHovered: boolean): React.CSSProperties {
  const tier = getPriceTier(cena);
  if (isSelected) {
    // Strong highlight when selected (click from map or table)
    const borderColors: Record<string, string> = {
      green: "#16a34a",
      yellow: "#ca8a04",
      orange: "#ea580c",
      unknown: "#64748b",
    };
    return {
      backgroundColor: "#dbeafe",
      borderLeft: `4px solid ${borderColors[tier]}`,
      outline: "none",
    };
  }
  if (isHovered) {
    const bgColors: Record<string, string> = {
      green: "#f0fdf4",
      yellow: "#fefce8",
      orange: "#fff7ed",
      unknown: "#f8fafc",
    };
    return {
      backgroundColor: bgColors[tier],
      borderLeft: `4px solid ${getPriceColor(cena)}44`,
    };
  }
  // Resting state: very subtle tint
  const restBg: Record<string, string> = {
    green: "#f0fdf480",
    yellow: "#fefce880",
    orange: "#fff7ed80",
    unknown: "transparent",
  };
  return {
    backgroundColor: restBg[tier],
    borderLeft: `4px solid ${getPriceColor(cena)}22`,
  };
}

// ─── Sort helpers ────────────────────────────────────────────────────────────

type SortKey = keyof Listing | null;
type SortDir = "asc" | "desc";

function sortListings(items: Listing[], key: SortKey, dir: SortDir): Listing[] {
  if (!key) return items;
  return [...items].sort((a, b) => {
    let av: string | number = String(a[key] ?? "");
    let bv: string | number = String(b[key] ?? "");
    if (key === "id") { av = a.id; bv = b.id; }
    else if (key === "cena") {
      av = parsePricePLN(a.cena) ?? -1;
      bv = parsePricePLN(b.cena) ?? -1;
    }
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av;
    }
    return dir === "asc"
      ? String(av).localeCompare(String(bv), "pl")
      : String(bv).localeCompare(String(av), "pl");
  });
}

// ─── Column config ───────────────────────────────────────────────────────────

const COLUMNS: {
  key: keyof Listing;
  label: string;
  sortable?: boolean;
  minW?: string;
  maxW?: string;
  wrap?: boolean;
  sticky?: "left" | "right";
  stickyOffset?: number;
}[] = [
  { key: "id",            label: "ID",              sortable: true,  minW: "44px",  maxW: "52px",  sticky: "left",  stickyOffset: 0 },
  { key: "url",           label: "URL",                              minW: "52px",  maxW: "60px" },
  { key: "wojewodztwo",   label: "Województwo",     sortable: true,  minW: "110px", maxW: "150px" },
  { key: "powiat",        label: "Powiat",           sortable: true,  minW: "100px", maxW: "140px" },
  { key: "gmina",         label: "Gmina",            sortable: true,  minW: "100px", maxW: "140px" },
  { key: "miejscowosc",   label: "Miejscowość",      sortable: true,  minW: "100px", maxW: "150px" },
  { key: "rozmiarDzialki",label: "Rozmiar działki",  sortable: true,  minW: "100px", maxW: "130px" },
  { key: "media",         label: "Media",                            minW: "140px", maxW: "220px", wrap: true },
  { key: "przeznaczenie", label: "Przeznaczenie",    sortable: true,  minW: "100px", maxW: "160px" },
  { key: "zabudowania",   label: "Zabudowania",                      minW: "160px", maxW: "260px", wrap: true },
  { key: "cena",          label: "Cena",             sortable: true,  minW: "90px",  maxW: "120px", sticky: "right", stickyOffset: 36 },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function Listings() {
  const utils = trpc.useUtils();

  // Filters
  const [filterWoj, setFilterWoj] = useState("");
  const [filterPrz, setFilterPrz] = useState("");
  const [search, setSearch] = useState("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Selection: hoveredId is transient (mouse), selectedId is persistent (click)
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
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Data
  const { data: allListings = [], isLoading, refetch } = trpc.listings.getAll.useQuery();
  const submitMutation = trpc.listings.submitUrl.useMutation();
  const deleteMutation = trpc.listings.delete.useMutation();

  // Derived: unique filter values
  const uniqueWoj = useMemo(
    () => Array.from(new Set(allListings.map(l => l.wojewodztwo).filter(v => v && v !== "-"))).sort((a, b) => a.localeCompare(b, "pl")),
    [allListings]
  );
  // Fixed przeznaczenie categories — always shown in this order
  const PRZEZNACZENIE_CATEGORIES = [
    'budowlana',
    'rekreacyjna/letniskowa',
    'mieszkaniowa',
    'siedliskowa',
    'rolna',
    'rolno-budowlana',
    'mieszana/inne',
    'brak danych',
  ];
  // Only show categories that actually exist in current data
  const uniquePrz = useMemo(
    () => PRZEZNACZENIE_CATEGORIES.filter(cat => allListings.some(l => l.przeznaczenie === cat)),
    [allListings]
  );

  // Filtered + sorted listings
  const filtered = useMemo(() => {
    let items = allListings.filter(l => {
      if (filterWoj && l.wojewodztwo !== filterWoj) return false;
      if (filterPrz && l.przeznaczenie !== filterPrz) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          l.miejscowosc.toLowerCase().includes(q) ||
          l.gmina.toLowerCase().includes(q) ||
          l.powiat.toLowerCase().includes(q) ||
          l.wojewodztwo.toLowerCase().includes(q) ||
          String(l.id).includes(q)
        );
      }
      return true;
    });
    return sortListings(items, sortKey, sortDir);
  }, [allListings, filterWoj, filterPrz, search, sortKey, sortDir]);

  // Price tier counts
  const counts = useMemo(() => {
    const c = { green: 0, yellow: 0, orange: 0, unknown: 0 };
    filtered.forEach(l => { c[getPriceTier(l.cena)]++; });
    return c;
  }, [filtered]);

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

  // ── Map: create/update markers ─────────────────────────────────────────────
  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();
    setMapReady(true);
  }, []);

  // The "active" id for map marker sizing: selected takes priority over hovered
  const activeMapId = selectedId ?? hoveredId;

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const filteredIds = new Set(filtered.map(l => l.id));
    markersRef.current.forEach((marker, id) => {
      if (!filteredIds.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
      }
    });

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

    if (!activeMapId && markersRef.current.size > 0) {
      const bounds = new google.maps.LatLngBounds();
      let hasPoints = false;
      markersRef.current.forEach(m => {
        const pos = m.position;
        if (pos) { bounds.extend(pos); hasPoints = true; }
      });
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
      const scale = isActive ? 1.45 : 1;
      marker.content = createPinElement(id, color, scale, isActive);
      marker.zIndex = isActive ? 999 : id;
    });
  }, [activeMapId, allListings]);

  function createPinElement(id: number, color: string, scale: number, isActive: boolean): HTMLElement {
    const size = Math.round(28 * scale);
    const fontSize = Math.round(11 * scale);
    const el = document.createElement("div");
    el.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border: ${isActive ? "3px solid white" : "2px solid white"};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${fontSize}px;
      font-weight: bold;
      color: white;
      cursor: pointer;
      box-shadow: ${isActive ? `0 0 0 3px ${color}66, 0 4px 12px rgba(0,0,0,0.4)` : "0 2px 6px rgba(0,0,0,0.35)"};
      transition: transform 0.15s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      user-select: none;
    `;
    el.textContent = String(id);
    return el;
  }

  function showInfoWindow(listing: Listing, marker: google.maps.marker.AdvancedMarkerElement) {
    if (!infoWindowRef.current) return;
    const color = getPriceColor(listing.cena);
    infoWindowRef.current.setContent(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-width: 200px; padding: 4px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <div style="width:24px;height:24px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:11px;flex-shrink:0;">${listing.id}</div>
          <strong style="font-size:14px;">${listing.miejscowosc}</strong>
        </div>
        ${listing.gmina !== "-" ? `<div style="font-size:12px;color:#64748b;margin-bottom:4px;">Gmina: ${listing.gmina}</div>` : ""}
        ${listing.wojewodztwo !== "-" ? `<div style="font-size:12px;color:#64748b;margin-bottom:4px;">Woj. ${listing.wojewodztwo}</div>` : ""}
        ${listing.rozmiarDzialki !== "-" ? `<div style="font-size:12px;color:#64748b;margin-bottom:4px;">Działka: ${listing.rozmiarDzialki}</div>` : ""}
        ${listing.przeznaczenie !== "-" ? `<div style="font-size:12px;color:#64748b;margin-bottom:4px;">Przeznaczenie: ${listing.przeznaczenie}</div>` : ""}
        <div style="font-size:15px;font-weight:bold;color:${color};margin: 6px 0;">${listing.cena !== "-" ? listing.cena : "Cena nieznana"}</div>
        <a href="${listing.url}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#3b82f6;text-decoration:none;">🔗 Otwórz ogłoszenie</a>
      </div>
    `);
    infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
  }

  function scrollToRow(id: number) {
    const row = rowRefs.current.get(id);
    if (row) {
      // Scroll the table container horizontally to start (to show sticky ID col)
      if (tableContainerRef.current) tableContainerRef.current.scrollLeft = 0;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // ── URL submission ─────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!submitUrl.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({ url: submitUrl.trim() });
      const meta = (result as any)?._meta;
      const geocoded = meta?.geocoded;
      const fetchOk = meta?.fetchSuccess;
      toast.success("Oferta dodana!", {
        description: fetchOk
          ? `Dane wyekstrahowane. ${geocoded ? "Lokalizacja na mapie ✓" : "Brak współrzędnych (lokalizacja nieznana)"}`
          : "Strona niedostępna — dane mogą być niekompletne. Sprawdź i uzupełnij ręcznie.",
        duration: fetchOk ? 4000 : 7000,
      });
      setSubmitUrl("");
      await refetch();
    } catch (err: any) {
      toast.error("Błąd podczas dodawania oferty", {
        description: err?.message || "Sprawdź URL i spróbuj ponownie.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    if (!confirm(`Usunąć ofertę #${id}?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      const marker = markersRef.current.get(id);
      if (marker) { marker.map = null; markersRef.current.delete(id); }
      if (selectedId === id) setSelectedId(null);
      await refetch();
      toast.success(`Oferta #${id} usunięta.`);
    } catch (err: any) {
      toast.error("Błąd podczas usuwania", { description: err?.message });
    }
  }

  // ── Sort toggle ────────────────────────────────────────────────────────────
  function toggleSort(key: keyof Listing) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: keyof Listing }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  const hasFilters = !!(filterWoj || filterPrz || search);
  function clearFilters() { setFilterWoj(""); setFilterPrz(""); setSearch(""); }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
          <p className="text-slate-500 text-sm">Ładowanie ofert...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <MapPin className="w-6 h-6 text-blue-600 flex-shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Tracker Ofert Nieruchomości</h1>
            <p className="text-xs text-slate-500">{allListings.length} ofert w bazie</p>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 py-4 space-y-4">

        {/* ── URL Submission ── */}
        <Card className="border border-blue-200 bg-blue-50/60 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Plus className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">Dodaj ofertę</span>
              </div>
              <div className="flex gap-2 flex-1 w-full">
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
                  {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Analizuję...</>
                  ) : "Dodaj"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-blue-600/70 mt-2 ml-0 sm:ml-[calc(4rem+8px)]">
              AI automatycznie wyciągnie dane: województwo, powiat, gmina, miejscowość, rozmiar działki, media, przeznaczenie, zabudowania, cena
            </p>
          </CardContent>
        </Card>

        {/* ── Filters + Legend ── */}
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1 min-w-[160px]">
                <label className="text-xs font-medium text-slate-600">Województwo</label>
                <Select value={filterWoj || "__all__"} onValueChange={v => setFilterWoj(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Wszystkie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Wszystkie</SelectItem>
                    {uniqueWoj.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1 min-w-[160px]">
                <label className="text-xs font-medium text-slate-600">Przeznaczenie</label>
                <Select value={filterPrz || "__all__"} onValueChange={v => setFilterPrz(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Wszystkie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Wszystkie</SelectItem>
                    {uniquePrz.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <label className="text-xs font-medium text-slate-600">Szukaj</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    className="h-8 pl-8 text-sm"
                    placeholder="Miejscowość, gmina, ID..."
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
                  <button
                    className="ml-1 text-slate-400 hover:text-slate-600"
                    onClick={() => setSelectedId(null)}
                    title="Odznacz"
                  >
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
            <MapView
              initialCenter={{ lat: 52.0, lng: 19.5 }}
              initialZoom={6}
              onMapReady={handleMapReady}
              className="w-full h-full"
            />
          </div>
        </Card>

        {/* ── Table ── */}
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              Tabela ofert ({filtered.length})
              {selectedId && (
                <span className="text-xs font-normal text-slate-400">
                  — kliknij poza tabelą aby odznaczyć
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Outer div captures click-outside via ref */}
            <div ref={tableContainerRef} className="overflow-x-auto relative">
              <table className="w-full text-xs border-collapse" style={{ minWidth: "1100px", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "44px" }} />{/* ID */}
                  <col style={{ width: "48px" }} />{/* URL */}
                  <col style={{ width: "130px" }} />{/* Województwo */}
                  <col style={{ width: "110px" }} />{/* Powiat */}
                  <col style={{ width: "110px" }} />{/* Gmina */}
                  <col style={{ width: "110px" }} />{/* Miejscowość */}
                  <col style={{ width: "100px" }} />{/* Rozmiar działki */}
                  <col style={{ width: "180px" }} />{/* Media */}
                  <col style={{ width: "130px" }} />{/* Przeznaczenie */}
                  <col style={{ width: "200px" }} />{/* Zabudowania */}
                  <col style={{ width: "100px" }} />{/* Cena */}
                  <col style={{ width: "36px" }} />{/* Akcje */}
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {COLUMNS.map(col => {
                      const isSticky = !!col.sticky;
                      const stickyStyle: React.CSSProperties = isSticky
                        ? {
                            position: "sticky",
                            [col.sticky === "left" ? "left" : "right"]: col.stickyOffset ?? 0,
                            zIndex: 10,
                            background: "#f8fafc",
                            boxShadow: col.sticky === "left"
                              ? "2px 0 4px -1px rgba(0,0,0,0.08)"
                              : "-2px 0 4px -1px rgba(0,0,0,0.08)",
                          }
                        : {};
                      return (
                        <th
                          key={col.key}
                          className="text-left font-semibold text-slate-600 whitespace-nowrap px-3 py-2"
                          style={{ minWidth: col.minW, maxWidth: col.maxW, width: col.maxW, ...stickyStyle }}
                        >
                          {col.sortable ? (
                            <button
                              className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                              onClick={() => toggleSort(col.key)}
                            >
                              {col.label}
                              <SortIcon col={col.key} />
                            </button>
                          ) : col.label}
                        </th>
                      );
                    })}
                    {/* Actions column — sticky right at 0 */}
                    <th
                      className="text-left font-semibold text-slate-600 px-3 py-2"
                      style={{
                        position: "sticky",
                        right: 0,
                        zIndex: 10,
                        background: "#f8fafc",
                        boxShadow: "-2px 0 4px -1px rgba(0,0,0,0.08)",
                        width: "36px",
                        minWidth: "36px",
                        maxWidth: "36px",
                      }}
                    >
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length + 1} className="text-center text-slate-400 py-12 text-sm">
                        Brak ofert spełniających kryteria
                      </td>
                    </tr>
                  ) : (
                    filtered.map(listing => {
                      const isSelected = selectedId === listing.id;
                      const isHovered = hoveredId === listing.id && !isSelected;
                      const rowStyle = getRowTint(listing.cena, isSelected, isHovered);
                      const priceColor = getPriceColor(listing.cena);

                      // Sticky cell backgrounds must match row bg
                      const stickyBg = isSelected ? "#dbeafe" : isHovered
                        ? (getPriceTier(listing.cena) === "green" ? "#f0fdf4"
                          : getPriceTier(listing.cena) === "yellow" ? "#fefce8"
                          : getPriceTier(listing.cena) === "orange" ? "#fff7ed" : "#f8fafc")
                        : (getPriceTier(listing.cena) === "green" ? "#f0fdf480"
                          : getPriceTier(listing.cena) === "yellow" ? "#fefce880"
                          : getPriceTier(listing.cena) === "orange" ? "#fff7ed80" : "white");

                      return (
                        <tr
                          key={listing.id}
                          ref={el => { if (el) rowRefs.current.set(listing.id, el); else rowRefs.current.delete(listing.id); }}
                          style={rowStyle}
                          className="cursor-pointer transition-colors border-b border-slate-100 last:border-0"
                          onClick={() => {
                            // Toggle selection: click same row again to deselect
                            if (selectedId === listing.id) {
                              setSelectedId(null);
                              return;
                            }
                            setSelectedId(listing.id);
                            const marker = markersRef.current.get(listing.id);
                            if (marker && mapRef.current) {
                              const pos = marker.position;
                              if (pos) {
                                mapRef.current.panTo(pos);
                                mapRef.current.setZoom(12);
                                showInfoWindow(listing, marker);
                              }
                            }
                          }}
                          onMouseEnter={() => setHoveredId(listing.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          {/* ID — sticky left */}
                          <td
                            className="px-3 py-2 font-bold text-slate-800 whitespace-nowrap"
                            style={{
                              position: "sticky",
                              left: 0,
                              zIndex: 5,
                              background: stickyBg,
                              boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)",
                            }}
                          >
                            {isSelected && (
                              <span
                                className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 mb-0.5"
                                style={{ background: priceColor }}
                              />
                            )}
                            {listing.id}
                          </td>

                          {/* URL */}
                          <td className="px-3 py-2">
                            <a
                              href={listing.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span className="truncate max-w-[100px]">Link</span>
                            </a>
                          </td>

                          {/* Województwo */}
                          <td className="px-3 py-2 text-slate-700" style={{ maxWidth: "150px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={listing.wojewodztwo}>{listing.wojewodztwo}</td>
                          {/* Powiat */}
                          <td className="px-3 py-2 text-slate-600" style={{ maxWidth: "140px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={listing.powiat}>{listing.powiat}</td>
                          {/* Gmina */}
                          <td className="px-3 py-2 text-slate-600" style={{ maxWidth: "140px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={listing.gmina}>{listing.gmina}</td>
                          {/* Miejscowość */}
                          <td className="px-3 py-2 font-medium text-slate-800" style={{ maxWidth: "150px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={listing.miejscowosc}>{listing.miejscowosc}</td>
                          {/* Rozmiar działki */}
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap" style={{ maxWidth: "130px" }}>{listing.rozmiarDzialki}</td>
                          {/* Media — wraps */}
                          <td className="px-3 py-2 text-slate-600" style={{ maxWidth: "220px", minWidth: "140px", whiteSpace: "normal", lineHeight: "1.4" }}>{listing.media}</td>
                          {/* Przeznaczenie */}
                          <td className="px-3 py-2 whitespace-nowrap" style={{ maxWidth: "160px" }}>
                            {listing.przeznaczenie !== "-" ? (
                              <Badge variant="outline" className="text-xs font-normal">{listing.przeznaczenie}</Badge>
                            ) : "-"}
                          </td>
                          {/* Zabudowania — wraps */}
                          <td className="px-3 py-2 text-slate-600" style={{ maxWidth: "260px", minWidth: "160px", whiteSpace: "normal", lineHeight: "1.4" }}>{listing.zabudowania}</td>

                          {/* Cena — sticky right */}
                          <td
                            className="px-3 py-2 whitespace-nowrap"
                            style={{
                              position: "sticky",
                              right: 40,
                              zIndex: 5,
                              background: stickyBg,
                              boxShadow: "-2px 0 4px -1px rgba(0,0,0,0.08)",
                            }}
                          >
                            <span className="font-bold text-sm" style={{ color: priceColor }}>
                              {listing.cena}
                            </span>
                          </td>

                          {/* Actions — sticky right at 0 */}
                          <td
                            className="px-1 py-2"
                            style={{
                              position: "sticky",
                              right: 0,
                              zIndex: 5,
                              background: stickyBg,
                              boxShadow: "-2px 0 4px -1px rgba(0,0,0,0.08)",
                              width: "36px",
                              minWidth: "36px",
                              maxWidth: "36px",
                            }}
                          >
                            <button
                              className="text-slate-300 hover:text-red-500 transition-colors"
                              onClick={e => { e.stopPropagation(); handleDelete(listing.id); }}
                              title="Usuń ofertę"
                            >
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
    </div>
  );
}
