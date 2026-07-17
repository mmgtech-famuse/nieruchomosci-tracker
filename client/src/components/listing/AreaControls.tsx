import { useState } from "react";
import { Pencil, Shapes, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AreaInfo } from "@shared/types";

const AREA_COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0d9488"];

/**
 * Map overlay controls for "areas of interest": start polygon drawing,
 * list saved areas, toggle visibility, delete. Rendered above the map card.
 */
export function AreaControls({
  areas,
  drawing,
  onStartDrawing,
  onCancelDrawing,
  onDelete,
  hiddenAreaIds,
  onToggleVisibility,
}: {
  areas: AreaInfo[];
  drawing: boolean;
  onStartDrawing: (color: string) => void;
  onCancelDrawing: () => void;
  onDelete: (id: number) => void;
  hiddenAreaIds: Set<number>;
  onToggleVisibility: (id: number) => void;
}) {
  const [nextColor, setNextColor] = useState(AREA_COLORS[0]);

  return (
    <div className="flex items-center gap-1.5">
      {drawing ? (
        <button
          className="h-7 px-2.5 text-[11px] rounded-md border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1 transition-colors"
          onClick={onCancelDrawing}
        >
          ✕ Anuluj rysowanie
        </button>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-7 px-2.5 text-[11px] rounded-md border border-slate-200 bg-white/95 text-slate-600 hover:border-blue-300 hover:text-blue-600 flex items-center gap-1 shadow-sm transition-colors"
              title="Obszary zainteresowania na mapie"
            >
              <Shapes className="w-3 h-3" />
              Obszary{areas.length > 0 && <span className="text-blue-600 font-bold">({areas.length})</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2.5">
            <p className="text-xs font-semibold text-slate-700 mb-0.5">Obszary zainteresowania</p>
            <p className="text-[10px] text-slate-400 mb-2 leading-snug">
              Narysuj obszar na mapie, aby zaznaczyć preferowane lokalizacje. Możesz filtrować oferty wewnątrz obszarów.
            </p>
            {areas.length > 0 && (
              <div className="space-y-1 mb-2 max-h-36 overflow-y-auto">
                {areas.map(a => (
                  <div key={a.id} className="group flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-slate-50">
                    <button
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                      onClick={() => onToggleVisibility(a.id)}
                      title={hiddenAreaIds.has(a.id) ? "Pokaż obszar" : "Ukryj obszar"}
                    >
                      <span
                        className="w-3 h-3 rounded-sm border flex-shrink-0"
                        style={{
                          background: hiddenAreaIds.has(a.id) ? "transparent" : `${a.color}55`,
                          borderColor: a.color,
                        }}
                      />
                      <span className={`text-[11px] truncate ${hiddenAreaIds.has(a.id) ? "text-slate-300 line-through" : "text-slate-600"}`}>
                        {a.name}
                      </span>
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 flex-shrink-0 transition-opacity"
                      onClick={() => onDelete(a.id)}
                      title="Usuń obszar"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center gap-1 mb-1.5">
                {AREA_COLORS.map(c => (
                  <button
                    key={c}
                    className={`w-4 h-4 rounded-full transition-transform ${nextColor === c ? "scale-125 ring-1 ring-offset-1 ring-slate-400" : "hover:scale-110"}`}
                    style={{ background: c }}
                    onClick={() => setNextColor(c)}
                  />
                ))}
              </div>
              <button
                className="w-full h-7 text-[11px] rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-1.5 transition-colors"
                onClick={() => onStartDrawing(nextColor)}
              >
                <Pencil className="w-3 h-3" /> Rysuj nowy obszar
              </button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
