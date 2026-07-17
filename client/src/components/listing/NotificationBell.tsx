import { Bell, TrendingDown, AlertTriangle, RefreshCw, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { NotificationItem } from "@shared/types";

const TYPE_ICONS: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  price_drop:     { icon: TrendingDown,  color: "#16a34a", bg: "#dcfce7" },
  price_increase: { icon: TrendingDown,  color: "#ea580c", bg: "#ffedd5" },
  status_change:  { icon: RefreshCw,     color: "#2563eb", bg: "#dbeafe" },
  listing_expired:{ icon: AlertTriangle, color: "#dc2626", bg: "#fee2e2" },
};

function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "przed chwilą";
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} godz. temu`;
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

/**
 * Notification bell for the page header. Shows unread badge; popover lists
 * price drops, status changes and expired-listing alerts.
 */
export function NotificationBell({
  notifications,
  unreadCount,
  onMarkAllRead,
  onListingClick,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onListingClick?: (listingId: number) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors border border-slate-200 hover:border-blue-200"
          title="Powiadomienia"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border border-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 bg-slate-50 rounded-t-md">
          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-blue-600" /> Powiadomienia
          </span>
          {unreadCount > 0 && (
            <button
              className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1"
              onClick={onMarkAllRead}
            >
              <CheckCheck className="w-3 h-3" /> Oznacz przeczytane
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-8">
              Brak powiadomień.<br />
              <span className="text-[10px]">Zmiany cen i statusów pojawią się tutaj.</span>
            </p>
          ) : (
            notifications.map(n => {
              const meta = TYPE_ICONS[n.type] ?? { icon: Bell, color: "#64748b", bg: "#f1f5f9" };
              const Icon = meta.icon;
              return (
                <button
                  key={n.id}
                  className={`w-full text-left flex gap-2.5 px-3 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors ${!n.read ? "bg-blue-50/40" : ""}`}
                  onClick={() => { if (n.listingId !== null) onListingClick?.(n.listingId); }}
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: meta.bg }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium text-slate-700 leading-snug">
                      {!n.read && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 mb-px" />}
                      {n.title}
                    </span>
                    {n.body && <span className="block text-[11px] text-slate-500 leading-snug">{n.body}</span>}
                    <span className="block text-[10px] text-slate-300 mt-0.5">{formatTime(n.createdAt)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
