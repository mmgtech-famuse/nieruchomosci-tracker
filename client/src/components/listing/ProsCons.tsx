import { useState } from "react";
import { Loader2, Scale, ThumbsDown, ThumbsUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Render a newline-separated pros/cons string as a compact list. */
export function ProsConsList({ value, type }: { value: string | null; type: "pros" | "cons" }) {
  if (!value || !value.trim()) return <span className="text-slate-300">—</span>;
  const items = value.split("\n").map(s => s.trim()).filter(Boolean);
  return (
    <ul className="space-y-0.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1 text-xs leading-snug">
          <span className={`flex-shrink-0 mt-px ${type === "pros" ? "text-green-500" : "text-red-400"}`}>
            {type === "pros" ? "+" : "−"}
          </span>
          <span className="text-slate-600">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Pros & cons editor dialog — one line per point. Shown in the compare sheet
 * where side-by-side viewing makes the trade-offs obvious.
 */
export function ProsConsEditor({
  listingId,
  listingLabel,
  pros,
  cons,
  onSave,
}: {
  listingId: number;
  listingLabel: string;
  pros: string | null;
  cons: string | null;
  onSave: (listingId: number, pros: string, cons: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draftPros, setDraftPros] = useState(pros ?? "");
  const [draftCons, setDraftCons] = useState(cons ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(listingId, draftPros.trim(), draftCons.trim());
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1 transition-colors"
        onClick={e => { e.stopPropagation(); setDraftPros(pros ?? ""); setDraftCons(cons ?? ""); setOpen(true); }}
        title="Edytuj plusy i minusy"
      >
        <Scale className="w-3 h-3" /> {pros || cons ? "Edytuj +/−" : "Dodaj +/−"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Scale className="w-4 h-4 text-blue-600" />
              Plusy i minusy — {listingLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-green-700 flex items-center gap-1 mb-1">
                <ThumbsUp className="w-3 h-3" /> Plusy <span className="text-slate-400 font-normal">(jeden na linię)</span>
              </label>
              <textarea
                className="w-full h-24 text-xs border border-green-200 rounded-md p-2 resize-y bg-green-50/30 focus:outline-none focus:ring-1 focus:ring-green-400"
                placeholder={"Blisko lasu\nDobry dojazd\nMedia w drodze"}
                value={draftPros}
                onChange={e => setDraftPros(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-red-600 flex items-center gap-1 mb-1">
                <ThumbsDown className="w-3 h-3" /> Minusy <span className="text-slate-400 font-normal">(jeden na linię)</span>
              </label>
              <textarea
                className="w-full h-24 text-xs border border-red-200 rounded-md p-2 resize-y bg-red-50/30 focus:outline-none focus:ring-1 focus:ring-red-400"
                placeholder={"Linia wysokiego napięcia\nDaleko do sklepu"}
                value={draftCons}
                onChange={e => setDraftCons(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>Anuluj</Button>
              <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Zapisz"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
