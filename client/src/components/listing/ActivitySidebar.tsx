import { History, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserBadge } from "./UserBadge";
import type { ActivityItem } from "@shared/types";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  listing_added:    { label: "dodał(a) ofertę",        color: "#2563eb" },
  status_changed:   { label: "zmienił(a) status",       color: "#eab308" },
  note_added:       { label: "dodał(a) notatkę",        color: "#8b5cf6" },
  note_replied:     { label: "odpowiedział(a) na notatkę", color: "#8b5cf6" },
  rating_added:     { label: "ocenił(a) ofertę",        color: "#f59e0b" },
  notes_updated:    { label: "zaktualizował(a) notatki", color: "#8b5cf6" },
  listing_archived: { label: "zarchiwizował(a) ofertę", color: "#64748b" },
  listing_deleted:  { label: "usunął(-ęła) ofertę",     color: "#ef4444" },
  price_changed:    { label: "wykryto zmianę ceny",     color: "#16a34a" },
  listing_expired:  { label: "ogłoszenie wygasło",      color: "#ef4444" },
  tag_assigned:     { label: "dodał(a) etykietę",       color: "#0d9488" },
  flag_toggled:     { label: "zmienił(a) flagę",        color: "#eab308" },
};

function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "przed chwilą";
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} godz. temu`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} dn. temu`;
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

/**
 * Collapsible activity log sidebar (right-side Sheet). Opened from the header.
 * Simple chronological feed: who did what, when — no extra chrome.
 */
export function ActivitySidebar({
  open,
  onOpenChange,
  items,
  onListingClick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ActivityItem[];
  onListingClick?: (listingId: number) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <SheetTitle className="flex items-center gap-2 text-sm text-slate-800">
            <History className="w-4 h-4 text-blue-600" />
            Dziennik aktywności
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {items.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-8">Brak aktywności — działania rodziny pojawią się tutaj</p>
          ) : (
            <div className="space-y-0">
              {items.map(item => {
                const meta = ACTION_LABELS[item.action] ?? { label: item.action, color: "#64748b" };
                const isSystem = !item.userName;
                return (
                  <div key={item.id} className="flex gap-2.5 py-2 border-b border-slate-50 last:border-0">
                    {isSystem ? (
                      <span
                        className="inline-flex items-center justify-center rounded-full flex-shrink-0 mt-0.5"
                        style={{ width: 18, height: 18, background: "#f1f5f9", border: "1px solid #e2e8f0" }}
                        title="System / AI"
                      >
                        <span className="text-[9px]">🤖</span>
                      </span>
                    ) : (
                      <span className="mt-0.5"><UserBadge name={item.userName} size={18} /></span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-600 leading-snug">
                        <span className="font-semibold text-slate-700">{item.userName ?? "System"}</span>{" "}
                        <span style={{ color: meta.color }}>{meta.label}</span>
                        {item.listingId !== null && (
                          <button
                            className="ml-1 font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            onClick={() => { onListingClick?.(item.listingId!); onOpenChange(false); }}
                            title="Pokaż ofertę"
                          >
                            #{item.listingId}
                          </button>
                        )}
                      </p>
                      {item.detail && <p className="text-[11px] text-slate-400 leading-snug truncate" title={item.detail}>{item.detail}</p>}
                      <p className="text-[10px] text-slate-300">{formatTime(item.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
