import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LISTING_STATUSES, getStatusMeta } from "@shared/types";
import type { ListingStatus } from "@shared/types";

/**
 * Compact, color-coded status dropdown replacing the single "Do kontaktu" flag.
 * Matches the existing table design: text-xs pills with subtle borders.
 */
export function StatusDropdown({
  status,
  onChange,
  compact = false,
}: {
  status: string;
  onChange: (status: ListingStatus) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta = getStatusMeta(status);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-1 rounded-full border font-medium transition-all hover:shadow-sm focus:outline-none"
          style={{
            background: meta.bg,
            borderColor: meta.border,
            color: meta.text,
            fontSize: compact ? "10px" : "11px",
            padding: compact ? "1px 6px" : "2px 8px",
            whiteSpace: "nowrap",
          }}
          onClick={e => e.stopPropagation()}
          title="Zmień status oferty"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: meta.color }}
          />
          {meta.label}
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[150px]" onClick={e => e.stopPropagation()}>
        {LISTING_STATUSES.map(s => (
          <DropdownMenuItem
            key={s.key}
            className="text-xs gap-2 cursor-pointer"
            onClick={e => {
              e.stopPropagation();
              if (s.key !== status) onChange(s.key);
              setOpen(false);
            }}
          >
            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span style={{ fontWeight: s.key === status ? 700 : 400 }}>{s.label}</span>
            {s.key === status && <span className="ml-auto text-slate-400">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
