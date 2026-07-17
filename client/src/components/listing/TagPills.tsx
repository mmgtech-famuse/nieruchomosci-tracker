import { useState } from "react";
import { Check, Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TAG_COLORS } from "@shared/types";
import type { TagInfo } from "@shared/types";

export function TagPill({ tag, small = false }: { tag: TagInfo; small?: boolean }) {
  const c = TAG_COLORS[tag.color] ?? TAG_COLORS.slate;
  return (
    <span
      className="inline-flex items-center rounded-full font-medium border"
      style={{
        background: c.bg,
        color: c.text,
        borderColor: c.border,
        fontSize: small ? "9px" : "10px",
        padding: small ? "0px 5px" : "1px 6px",
        whiteSpace: "nowrap",
        lineHeight: "1.5",
      }}
    >
      {tag.name}
    </span>
  );
}

/**
 * Inline tag pills for a listing row + popover for assigning/creating tags.
 * Custom tags like "Blisko lasu", "Duży ogród" — color-coded, filterable.
 */
export function TagPills({
  listingId,
  assignedTags,
  allTags,
  onAssign,
  onUnassign,
  onCreate,
  onDeleteTag,
}: {
  listingId: number;
  assignedTags: TagInfo[];
  allTags: TagInfo[];
  onAssign: (listingId: number, tagId: number) => void;
  onUnassign: (listingId: number, tagId: number) => void;
  onCreate: (name: string, color: string) => Promise<TagInfo | undefined>;
  onDeleteTag: (tagId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("green");
  const [creating, setCreating] = useState(false);
  const assignedIds = new Set(assignedTags.map(t => t.id));

  async function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const tag = await onCreate(name, newColor);
      if (tag) onAssign(listingId, tag.id);
      setNewName("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5" onClick={e => e.stopPropagation()}>
      {assignedTags.map(t => <TagPill key={t.id} tag={t} small />)}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={`inline-flex items-center justify-center rounded-full border border-dashed transition-colors ${
              assignedTags.length === 0
                ? "text-slate-300 border-slate-200 hover:text-teal-600 hover:border-teal-300 px-1.5 py-0.5 gap-0.5"
                : "text-slate-300 border-slate-200 hover:text-teal-600 hover:border-teal-300 w-4 h-4"
            }`}
            title="Zarządzaj etykietami"
          >
            <Plus className="w-2.5 h-2.5" />
            {assignedTags.length === 0 && <TagIcon className="w-2.5 h-2.5" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-2" onClick={e => e.stopPropagation()}>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 px-1">Etykiety</p>
          <div className="max-h-44 overflow-y-auto space-y-0.5 mb-2">
            {allTags.length === 0 && (
              <p className="text-[11px] text-slate-400 italic px-1 py-2">Brak etykiet — utwórz pierwszą poniżej</p>
            )}
            {allTags.map(t => {
              const isAssigned = assignedIds.has(t.id);
              return (
                <div key={t.id} className="group flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-slate-50">
                  <button
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    onClick={() => isAssigned ? onUnassign(listingId, t.id) : onAssign(listingId, t.id)}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isAssigned ? "bg-teal-500 border-teal-500" : "border-slate-300 bg-white"}`}>
                      {isAssigned && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    <TagPill tag={t} />
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity flex-shrink-0"
                    onClick={() => onDeleteTag(t.id)}
                    title="Usuń etykietę (ze wszystkich ofert)"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="border-t border-slate-100 pt-2 space-y-1.5">
            <Input
              className="h-7 text-xs"
              placeholder="Nowa etykieta, np. Blisko lasu"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
            />
            <div className="flex items-center gap-1">
              {Object.entries(TAG_COLORS).map(([key, c]) => (
                <button
                  key={key}
                  className={`w-4 h-4 rounded-full border transition-transform ${newColor === key ? "scale-125 ring-1 ring-offset-1 ring-slate-400" : "hover:scale-110"}`}
                  style={{ background: c.bg, borderColor: c.text }}
                  onClick={() => setNewColor(key)}
                  title={key}
                />
              ))}
              <Button
                size="sm"
                className="h-6 px-2 text-[10px] ml-auto bg-teal-600 hover:bg-teal-700 text-white"
                disabled={!newName.trim() || creating}
                onClick={handleCreate}
              >
                Dodaj
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
