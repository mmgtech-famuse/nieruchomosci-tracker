import { useState } from "react";
import { Home, Loader2, MapPin } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "Home base" settings popover: define a reference point (e.g. current home,
 * workplace) — distances to each listing are computed and shown in the table.
 */
export function HomeBasePopover({
  current,
  onSave,
  onClear,
  onPickOnMap,
  picking,
}: {
  current: { label: string | null; lat: string | null; lng: string | null } | null;
  onSave: (label: string, address: string) => Promise<void>;
  onClear: () => void;
  onPickOnMap: () => void;
  picking: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(current?.label ?? "");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const hasBase = !!(current?.lat && current?.lng);

  async function handleSave() {
    if (!address.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(label.trim() || "Dom", address.trim());
      setOpen(false);
      setAddress("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 text-xs gap-1.5 ${hasBase ? "text-emerald-700 border-emerald-300 hover:bg-emerald-50" : "text-slate-600 border-slate-300 hover:bg-slate-100"}`}
          title={hasBase ? `Punkt odniesienia: ${current?.label ?? "Dom"} — kliknij aby zmienić` : "Ustaw punkt odniesienia (dojazd do ofert)"}
        >
          <Home className="w-3.5 h-3.5" />
          {hasBase ? (current?.label ?? "Dom") : "Punkt dojazdu"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 space-y-2.5">
        <div>
          <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5 text-emerald-600" /> Punkt odniesienia dojazdu
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
            Ustaw np. obecny dom lub pracę — dla każdej oferty policzymy odległość i szacowany czas dojazdu.
          </p>
        </div>
        {hasBase && (
          <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-1.5 flex items-center gap-1.5">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            Aktualny: <strong>{current?.label ?? "Dom"}</strong> ({Number(current?.lat).toFixed(4)}, {Number(current?.lng).toFixed(4)})
          </div>
        )}
        <div className="space-y-1.5">
          <Input
            className="h-7 text-xs"
            placeholder="Nazwa, np. Dom / Praca"
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
          <Input
            className="h-7 text-xs"
            placeholder="Adres, np. Warszawa, ul. Prosta 1"
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!address.trim() || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Zapisz"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={() => { setOpen(false); onPickOnMap(); }}
            disabled={picking}
          >
            <MapPin className="w-3 h-3 mr-1" /> Wskaż na mapie
          </Button>
          {hasBase && (
            <button className="ml-auto text-[10px] text-slate-400 hover:text-red-500" onClick={() => { onClear(); setOpen(false); }}>
              Usuń
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
