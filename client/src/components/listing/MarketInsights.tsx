import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import type { Listing } from "@shared/types";

/** Parse "350 000 zł" / "350000" / "350 tys" → number of PLN, or null. */
export function parsePriceValue(cena: string | null | undefined): number | null {
  if (!cena) return null;
  const cleaned = cena.replace(/[^\d,.]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) return null;
  // Heuristic: if a bare small number like "350" appears with "tys" in original
  if (/tys/i.test(cena) && num < 10000) return num * 1000;
  return num;
}

/** Parse "1200 m2" / "0.12 ha" / "12 ar" → m², or null. */
export function parseAreaM2(rozmiar: string | null | undefined): number | null {
  if (!rozmiar) return null;
  const s = rozmiar.toLowerCase();
  const numMatch = s.replace(",", ".").match(/([\d.]+)/);
  if (!numMatch) return null;
  const num = parseFloat(numMatch[1]);
  if (isNaN(num) || num <= 0) return null;
  if (/ha/.test(s)) return num * 10000;
  if (/\bar/.test(s) || /arów|ary/.test(s)) return num * 100;
  return num; // assume m²
}

/**
 * Minimal market insights panel: avg price/m² per gmina, avg listing lifespan,
 * price range distribution. Collapsible, sits above the table. Key numbers only.
 */
export function MarketInsights({ listings }: { listings: Listing[] }) {
  const [expanded, setExpanded] = useState(false);

  const insights = useMemo(() => {
    const active = listings.filter(l => !l.archived);
    const archived = listings.filter(l => l.archived);

    // Avg price per m² per gmina (only where both parseable)
    const gminaMap: Record<string, { sum: number; n: number }> = {};
    for (const l of active) {
      const price = parsePriceValue(l.cena);
      const area = parseAreaM2(l.rozmiarDzialki);
      if (!price || !area || !l.gmina || l.gmina === "-") continue;
      const ppm2 = price / area;
      if (ppm2 < 1 || ppm2 > 10000) continue; // sanity bounds
      if (!gminaMap[l.gmina]) gminaMap[l.gmina] = { sum: 0, n: 0 };
      gminaMap[l.gmina].sum += ppm2;
      gminaMap[l.gmina].n += 1;
    }
    const perGmina = Object.entries(gminaMap)
      .map(([gmina, { sum, n }]) => ({ gmina, avg: sum / n, n }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 6);

    // Avg listing lifespan (days between createdAt and updatedAt for archived)
    let lifespanAvg: number | null = null;
    const lifespans = archived
      .map(l => (new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime()) / 86400000)
      .filter(d => d >= 0);
    if (lifespans.length > 0) lifespanAvg = lifespans.reduce((a, b) => a + b, 0) / lifespans.length;

    // Price range distribution
    const buckets = [
      { label: "do 200k", min: 0, max: 200000, count: 0 },
      { label: "200–300k", min: 200000, max: 300000, count: 0 },
      { label: "300–400k", min: 300000, max: 400000, count: 0 },
      { label: "400–500k", min: 400000, max: 500000, count: 0 },
      { label: "500k+", min: 500000, max: Infinity, count: 0 },
    ];
    let priced = 0;
    for (const l of active) {
      const p = parsePriceValue(l.cena);
      if (!p) continue;
      priced++;
      const b = buckets.find(b => p >= b.min && p < b.max);
      if (b) b.count++;
    }
    const maxBucket = Math.max(1, ...buckets.map(b => b.count));

    // Overall avg price per m²
    const allPpm2 = active
      .map(l => {
        const price = parsePriceValue(l.cena);
        const area = parseAreaM2(l.rozmiarDzialki);
        if (!price || !area) return null;
        const v = price / area;
        return v >= 1 && v <= 10000 ? v : null;
      })
      .filter((v): v is number => v !== null);
    const avgPpm2 = allPpm2.length > 0 ? allPpm2.reduce((a, b) => a + b, 0) / allPpm2.length : null;

    return { perGmina, lifespanAvg, buckets, maxBucket, priced, avgPpm2 };
  }, [listings]);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
      <button
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <BarChart3 className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-slate-600">Statystyki rynkowe</span>
        {!expanded && insights.avgPpm2 !== null && (
          <span className="text-xs text-slate-400">
            śr. <span className="font-bold text-indigo-600">{insights.avgPpm2.toFixed(0)} zł/m²</span>
            {insights.lifespanAvg !== null && (
              <> · oferta żyje śr. <span className="font-bold text-indigo-600">{insights.lifespanAvg.toFixed(0)} dni</span></>
            )}
          </span>
        )}
        <span className="ml-auto text-xs text-slate-400">{expanded ? "Zwiń" : "Rozwiń"}</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100">
          {/* Avg price per m² per gmina */}
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-1.5 mt-2">Śr. cena za m² wg gminy</p>
            {insights.perGmina.length === 0 ? (
              <p className="text-xs text-slate-300 italic">Za mało danych (potrzebna cena + rozmiar)</p>
            ) : (
              <div className="space-y-1">
                {insights.perGmina.map(g => (
                  <div key={g.gmina} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 truncate mr-2" title={`${g.n} ofert`}>{g.gmina}</span>
                    <span className="font-bold text-slate-800 whitespace-nowrap">{g.avg.toFixed(0)} zł/m²</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lifespan + overall */}
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-1.5 mt-2">Kluczowe liczby</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Śr. cena za m² (wszystkie)</span>
                <span className="font-bold text-slate-800">{insights.avgPpm2 !== null ? `${insights.avgPpm2.toFixed(0)} zł` : "—"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Śr. czas życia oferty</span>
                <span className="font-bold text-slate-800">{insights.lifespanAvg !== null ? `${insights.lifespanAvg.toFixed(0)} dni` : "—"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Ofert z ceną</span>
                <span className="font-bold text-slate-800">{insights.priced}</span>
              </div>
            </div>
          </div>

          {/* Price distribution */}
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-1.5 mt-2">Rozkład cen</p>
            <div className="space-y-1">
              {insights.buckets.map(b => (
                <div key={b.label} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 w-16 flex-shrink-0">{b.label}</span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-sm transition-all"
                      style={{ width: `${(b.count / insights.maxBucket) * 100}%` }}
                    />
                  </div>
                  <span className="font-medium text-slate-600 w-5 text-right">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
