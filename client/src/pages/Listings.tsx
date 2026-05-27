import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  // Handle Polish format: '375 000 zł', '375000', '375,000', '375.000'
  // Remove currency symbols and non-numeric chars except spaces, commas, dots
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

const COLUMNS: { key: keyof Listing; label: string; sortable?: boolean; minW?: string }[] = [
  { key: "id", label: "ID", sortable: true, minW: "50px" },
  { key: "url", label: "URL", minW: "80px" },
  { key: "wojewodztwo", label: "Województwo", sortable: true, minW: "120px" },
  { key: "powiat", label: "Powiat", sortable: true, minW: "100px" },
  { key: "gmina", label: "Gmina", sortable: true, minW: "100px" },
  { key: "miejscowosc", label: "Miejscowość", sortable: true, minW: "120px" },
  { key: "rozmiarDzialki", label: "Rozmiar działki", sortable: true, minW: "130px" },
  { key: "media", label: "Media", minW: "120px" },
  { key: "przeznaczenie", label: "Przeznaczenie", sortable: true, minW: "130px" },
  { key: "zabudowania", label: "Zabudowania", minW: "130px" },
  { key: "cena", label: "Cena", sortable: true, minW: "110px" },
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

  // Selection / highlight
  const [activeId, setActiveId] = useState<number | null>(null);

  // URL submission
  const [submitUrl, setSubmitUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Map refs
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Table row refs for auto-scroll
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // Data
  const { data: allListings = [], isLoading, refetch } = trpc.listings.getAll.useQuery();
  const submitMutation = trpc.listings.submitUrl.useMutation();
  const deleteMutation = trpc.listings.delete.useMutation();

  // Derived: unique filter values
  const uniqueWoj = useMemo(
    () => Array.from(new Set(allListings.map(l => l.wojewodztwo).filter(v => v && v !== "-"))).sort((a, b) => a.localeCompare(b, "pl")),
    [allListings]
  );
  const uniquePrz = useMemo(
    () => Array.from(new Set(allListings.map(l => l.przeznaczenie).filter(v => v && v !== "-"))).sort((a, b) => a.localeCompare(b, "pl")),
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

  // ── Map: create/update markers ─────────────────────────────────────────────
  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();
    setMapReady(true);
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    // Remove markers not in filtered set
    const filteredIds = new Set(filtered.map(l => l.id));
    markersRef.current.forEach((marker, id) => {
      if (!filteredIds.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
      }
    });

    // Add/update markers
    filtered.forEach(listing => {
      if (!listing.latitude || !listing.longitude) return;
      const lat = parseFloat(String(listing.latitude));
      const lng = parseFloat(String(listing.longitude));
      if (isNaN(lat) || isNaN(lng)) return;

      const color = getPriceColor(listing.cena);
      const isActive = activeId === listing.id;
      const scale = isActive ? 1.4 : 1;

      if (markersRef.current.has(listing.id)) {
        // Update existing marker content
        const existing = markersRef.current.get(listing.id)!;
        existing.content = createPinElement(listing.id, color, scale);
        return;
      }

      const markerEl = createPinElement(listing.id, color, scale);
      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat, lng },
        map: mapRef.current,
        title: `${listing.id}: ${listing.miejscowosc}`,
        content: markerEl,
        zIndex: isActive ? 999 : listing.id,
      });

      marker.addListener("gmp-click", () => {
        setActiveId(listing.id);
        showInfoWindow(listing, marker);
        scrollToRow(listing.id);
      });

      markersRef.current.set(listing.id, marker);
    });

    // Fit bounds if no active selection
    if (!activeId && markersRef.current.size > 0) {
      const bounds = new google.maps.LatLngBounds();
      let hasPoints = false;
      markersRef.current.forEach(m => {
        const pos = m.position;
        if (pos) { bounds.extend(pos); hasPoints = true; }
      });
      if (hasPoints) mapRef.current.fitBounds(bounds, 40);
    }
  }, [filtered, mapReady, activeId]);

  // Update active marker size when activeId changes
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const listing = allListings.find(l => l.id === id);
      if (!listing) return;
      const color = getPriceColor(listing.cena);
      const scale = activeId === id ? 1.4 : 1;
      marker.content = createPinElement(id, color, scale);
      marker.zIndex = activeId === id ? 999 : id;
    });
  }, [activeId, allListings]);

  function createPinElement(id: number, color: string, scale: number): HTMLElement {
    const size = Math.round(28 * scale);
    const fontSize = Math.round(11 * scale);
    const el = document.createElement("div");
    el.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${fontSize}px;
      font-weight: bold;
      color: white;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      transition: transform 0.15s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      user-select: none;
    `;
    el.textContent = String(id);
    return el;
  }

  function showInfoWindow(listing: Listing, marker: google.maps.marker.AdvancedMarkerElement) {
    if (!infoWindowRef.current) return;
    const price = parsePricePLN(listing.cena);
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
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
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
      if (activeId === id) setActiveId(null);
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

  // ── Clear filters ──────────────────────────────────────────────────────────
  const hasFilters = filterWoj || filterPrz || search;
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
                  ) : (
                    "Dodaj"
                  )}
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
              {/* Województwo */}
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

              {/* Przeznaczenie */}
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

              {/* Search */}
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

            {/* Legend + counts */}
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
            <CardTitle className="text-sm font-semibold text-slate-700">
              Tabela ofert ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    {COLUMNS.map(col => (
                      <TableHead
                        key={col.key}
                        className="text-xs font-semibold text-slate-600 whitespace-nowrap px-3 py-2"
                        style={{ minWidth: col.minW }}
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
                      </TableHead>
                    ))}
                    <TableHead className="text-xs font-semibold text-slate-600 px-3 py-2 w-10">
                      Akcje
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={COLUMNS.length + 1} className="text-center text-slate-400 py-12 text-sm">
                        Brak ofert spełniających kryteria
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(listing => {
                      const isActive = activeId === listing.id;
                      const priceColor = getPriceColor(listing.cena);
                      return (
                        <TableRow
                          key={listing.id}
                          ref={el => { if (el) rowRefs.current.set(listing.id, el); else rowRefs.current.delete(listing.id); }}
                          className={`cursor-pointer text-xs transition-colors ${
                            isActive
                              ? "bg-blue-50 hover:bg-blue-100"
                              : "hover:bg-slate-50"
                          }`}
                          onClick={() => {
                            setActiveId(listing.id);
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
                          onMouseEnter={() => setActiveId(listing.id)}
                          onMouseLeave={() => setActiveId(null)}
                        >
                          {/* ID */}
                          <TableCell className="px-3 py-2 font-bold text-slate-800">{listing.id}</TableCell>
                          {/* URL */}
                          <TableCell className="px-3 py-2">
                            <a
                              href={listing.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span className="truncate max-w-[120px]">Link</span>
                            </a>
                          </TableCell>
                          {/* Województwo */}
                          <TableCell className="px-3 py-2 text-slate-700">{listing.wojewodztwo}</TableCell>
                          {/* Powiat */}
                          <TableCell className="px-3 py-2 text-slate-600">{listing.powiat}</TableCell>
                          {/* Gmina */}
                          <TableCell className="px-3 py-2 text-slate-600">{listing.gmina}</TableCell>
                          {/* Miejscowość */}
                          <TableCell className="px-3 py-2 font-medium text-slate-800">{listing.miejscowosc}</TableCell>
                          {/* Rozmiar działki */}
                          <TableCell className="px-3 py-2 text-slate-600">{listing.rozmiarDzialki}</TableCell>
                          {/* Media */}
                          <TableCell className="px-3 py-2 text-slate-600 max-w-[150px]">
                            <span className="truncate block" title={listing.media}>{listing.media}</span>
                          </TableCell>
                          {/* Przeznaczenie */}
                          <TableCell className="px-3 py-2">
                            {listing.przeznaczenie !== "-" ? (
                              <Badge variant="outline" className="text-xs font-normal">{listing.przeznaczenie}</Badge>
                            ) : "-"}
                          </TableCell>
                          {/* Zabudowania */}
                          <TableCell className="px-3 py-2 text-slate-600 max-w-[150px]">
                            <span className="truncate block" title={listing.zabudowania}>{listing.zabudowania}</span>
                          </TableCell>
                          {/* Cena */}
                          <TableCell className="px-3 py-2">
                            <span className="font-bold text-sm" style={{ color: priceColor }}>
                              {listing.cena}
                            </span>
                          </TableCell>
                          {/* Actions */}
                          <TableCell className="px-3 py-2">
                            <button
                              className="text-slate-300 hover:text-red-500 transition-colors"
                              onClick={e => { e.stopPropagation(); handleDelete(listing.id); }}
                              title="Usuń ofertę"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
