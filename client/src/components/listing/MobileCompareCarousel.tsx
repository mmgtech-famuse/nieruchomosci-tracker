import { ExternalLink, GitCompareArrows, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { ProsConsList } from "./ProsCons";
import { getStatusMeta, computeWeightedScore } from "@shared/types";
import type { CriterionInfo, CriterionScores, Listing, RatingStats } from "@shared/types";

/**
 * Mobile-friendly compare view: one full-width card per listing, swipeable
 * (embla carousel). Shows the same fields as the desktop compare table.
 */
export function MobileCompareCarousel({
  open,
  onOpenChange,
  listings,
  ratingStats,
  getPriceColor,
  criteria,
  scores,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: Listing[];
  ratingStats: RatingStats;
  getPriceColor: (cena: string | null) => string;
  criteria: CriterionInfo[];
  scores: CriterionScores;
  onClear: () => void;
}) {
  const fields: { label: string; render: (l: Listing) => React.ReactNode }[] = [
    { label: "Województwo", render: l => l.wojewodztwo || "—" },
    { label: "Powiat", render: l => l.powiat || "—" },
    { label: "Gmina", render: l => l.gmina || "—" },
    { label: "Rozmiar działki", render: l => l.rozmiarDzialki || "—" },
    { label: "Media", render: l => l.media || "—" },
    { label: "Przeznaczenie", render: l => l.przeznaczenie || "—" },
    { label: "Zabudowania", render: l => l.zabudowania || "—" },
    { label: "Notatki", render: l => l.notes || "—" },
    {
      label: "Ocena",
      render: l => {
        const s = ratingStats[l.id];
        return s ? `★ ${s.avg.toFixed(1)} (${s.count})` : "—";
      },
    },
    {
      label: "Dojazd",
      render: l => l.distanceKm !== null ? `${l.distanceKm} km${l.distanceMin !== null ? ` · ~${l.distanceMin} min` : ""}` : "—",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full w-full h-full max-h-full p-0 rounded-none flex flex-col sm:max-w-lg sm:h-auto sm:max-h-[90vh] sm:rounded-lg">
        <DialogHeader className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm text-slate-800">
            <GitCompareArrows className="w-4 h-4 text-blue-600" />
            Porównanie ({listings.length})
            <span className="text-[10px] font-normal text-slate-400 ml-1">← przesuń →</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-3">
          {listings.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-12">Brak zaznaczonych ofert</p>
          ) : (
            <Carousel className="w-full" opts={{ loop: false }}>
              <CarouselContent>
                {listings.map(l => {
                  const color = getPriceColor(l.cena);
                  const statusMeta = getStatusMeta(l.status);
                  const weightedScore = computeWeightedScore(criteria, scores[l.id]);
                  return (
                    <CarouselItem key={l.id}>
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm mx-1">
                        {/* Card header */}
                        <div className="px-3 py-2.5 border-b border-slate-100" style={{ background: "#f8fafc" }}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0" style={{ background: color }}>{l.id}</div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800 text-sm truncate">{l.miejscowosc || "—"}</p>
                              <p className="text-[10px] text-slate-500 truncate">{l.gmina}, {l.powiat}</p>
                            </div>
                            <span
                              className="inline-flex items-center gap-1 rounded-full border font-medium text-[9px] px-1.5 py-0.5 flex-shrink-0"
                              style={{ background: statusMeta.bg, borderColor: statusMeta.border, color: statusMeta.text }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusMeta.color }} />
                              {statusMeta.label}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="font-bold text-base" style={{ color }}>{l.cena || "—"}</span>
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 text-[11px] flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" /> Ogłoszenie
                            </a>
                          </div>
                        </div>
                        {/* Fields */}
                        <div className="divide-y divide-slate-50">
                          {fields.map(f => (
                            <div key={f.label} className="px-3 py-1.5 flex gap-2 text-xs">
                              <span className="text-slate-400 w-24 flex-shrink-0">{f.label}</span>
                              <span className="text-slate-700 flex-1" style={{ whiteSpace: "pre-wrap" }}>{f.render(l)}</span>
                            </div>
                          ))}
                          {/* Pros / cons */}
                          <div className="px-3 py-1.5 flex gap-2 text-xs">
                            <span className="text-slate-400 w-24 flex-shrink-0">Plusy</span>
                            <div className="flex-1"><ProsConsList value={l.pros} type="pros" /></div>
                          </div>
                          <div className="px-3 py-1.5 flex gap-2 text-xs">
                            <span className="text-slate-400 w-24 flex-shrink-0">Minusy</span>
                            <div className="flex-1"><ProsConsList value={l.cons} type="cons" /></div>
                          </div>
                          {weightedScore !== null && (
                            <div className="px-3 py-1.5 flex gap-2 text-xs bg-amber-50/60">
                              <span className="text-slate-500 w-24 flex-shrink-0 font-medium">Wynik ważony</span>
                              <span className="font-bold text-amber-600">{weightedScore.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              {listings.length > 1 && (
                <>
                  <CarouselPrevious className="left-1 h-7 w-7" />
                  <CarouselNext className="right-1 h-7 w-7" />
                </>
              )}
            </Carousel>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex justify-between items-center bg-slate-50 flex-shrink-0">
          <button
            className="text-xs text-slate-500 hover:text-red-500 transition-colors flex items-center gap-1"
            onClick={() => { onClear(); onOpenChange(false); }}
          >
            <X className="w-3.5 h-3.5" /> Wyczyść
          </button>
          <button
            className="text-xs text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-100"
            onClick={() => onOpenChange(false)}
          >
            Zamknij
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
