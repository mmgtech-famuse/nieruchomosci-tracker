import { useState } from "react";
import { Plus, Settings2, Trash2, Trophy } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeWeightedScore } from "@shared/types";
import type { CriterionInfo, CriterionScores } from "@shared/types";
import type { Listing } from "@shared/types";

/** Small 1–5 dot selector for scoring a criterion. */
function ScoreDots({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (score: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s}
          className={`w-3.5 h-3.5 rounded-full border transition-all ${
            value !== undefined && s <= value
              ? "bg-blue-500 border-blue-500"
              : "bg-white border-slate-300 hover:border-blue-400"
          }`}
          onClick={e => { e.stopPropagation(); onChange(s); }}
          title={`${s}/5`}
        />
      ))}
    </div>
  );
}

/** Popover for managing shared scoring criteria and weights. */
export function CriteriaManager({
  criteria,
  onCreate,
  onUpdate,
  onDelete,
}: {
  criteria: CriterionInfo[];
  onCreate: (name: string, weight: number) => void;
  onUpdate: (id: number, data: { name?: string; weight?: number }) => void;
  onDelete: (id: number) => void;
}) {
  const [newName, setNewName] = useState("");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-[10px] text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors" title="Zarządzaj kryteriami oceny">
          <Settings2 className="w-3 h-3" /> Kryteria
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-xs font-semibold text-slate-700 mb-1">Kryteria rodzinne</p>
        <p className="text-[10px] text-slate-400 mb-2 leading-snug">
          Wspólne kryteria z wagami 1–5. Ocena ważona = średnia ocen × wagi.
        </p>
        <div className="space-y-1.5 max-h-52 overflow-y-auto mb-2">
          {criteria.length === 0 && (
            <p className="text-[11px] text-slate-400 italic py-1">Brak kryteriów — dodaj np. „Dojazd", „Cisza", „Cena"</p>
          )}
          {criteria.map(c => (
            <div key={c.id} className="flex items-center gap-1.5">
              <Input
                className="h-6 text-[11px] flex-1"
                defaultValue={c.name}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.name) onUpdate(c.id, { name: v }); }}
              />
              <select
                className="h-6 text-[10px] border border-slate-200 rounded px-1 bg-white"
                value={c.weight}
                onChange={e => onUpdate(c.id, { weight: Number(e.target.value) })}
                title="Waga kryterium"
              >
                {[1, 2, 3, 4, 5].map(w => <option key={w} value={w}>waga {w}</option>)}
              </select>
              <button className="text-slate-300 hover:text-red-500" onClick={() => onDelete(c.id)} title="Usuń kryterium">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2">
          <Input
            className="h-6 text-[11px] flex-1"
            placeholder="Nowe kryterium…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newName.trim()) { onCreate(newName.trim(), 3); setNewName(""); } }}
          />
          <Button
            size="sm"
            className="h-6 px-2 text-[10px] bg-blue-600 hover:bg-blue-700 text-white"
            disabled={!newName.trim()}
            onClick={() => { onCreate(newName.trim(), 3); setNewName(""); }}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Weighted scoring block for the compare sheet: rows = criteria, columns =
 * compared listings; final weighted score row highlights the best listing.
 */
export function WeightedScoringSection({
  listings,
  criteria,
  scores,
  onSetScore,
  onCreateCriterion,
  onUpdateCriterion,
  onDeleteCriterion,
}: {
  listings: Listing[];
  criteria: CriterionInfo[];
  scores: CriterionScores;
  onSetScore: (listingId: number, criterionId: number, score: number) => void;
  onCreateCriterion: (name: string, weight: number) => void;
  onUpdateCriterion: (id: number, data: { name?: string; weight?: number }) => void;
  onDeleteCriterion: (id: number) => void;
}) {
  const weighted = listings.map(l => ({
    id: l.id,
    score: computeWeightedScore(criteria, scores[l.id]),
  }));
  const best = weighted.reduce<{ id: number; score: number } | null>((acc, w) => {
    if (w.score === null) return acc;
    if (!acc || w.score > acc.score) return { id: w.id, score: w.score };
    return acc;
  }, null);

  return (
    <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-500" /> Ocena ważona (kryteria rodzinne)
        </span>
        <CriteriaManager
          criteria={criteria}
          onCreate={onCreateCriterion}
          onUpdate={onUpdateCriterion}
          onDelete={onDeleteCriterion}
        />
      </div>
      {criteria.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic px-3 py-3">
          Dodaj kryteria (np. „Dojazd", „Cisza", „Cena za m²") przez przycisk „Kryteria" powyżej, aby oceniać oferty punktowo.
        </p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <tbody>
            {criteria.map((c, ci) => (
              <tr key={c.id} className={ci % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className="px-3 py-1.5 font-medium text-slate-600 whitespace-nowrap border-r border-slate-100" style={{ width: "130px" }}>
                  {c.name} <span className="text-[9px] text-slate-400">×{c.weight}</span>
                </td>
                {listings.map(l => (
                  <td key={l.id} className="px-3 py-1.5 border-r border-slate-100">
                    <ScoreDots
                      value={scores[l.id]?.[c.id]}
                      onChange={s => onSetScore(l.id, c.id, s)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-amber-50/60 border-t border-amber-100">
              <td className="px-3 py-2 font-bold text-slate-700 border-r border-slate-100">Wynik ważony</td>
              {weighted.map(w => (
                <td key={w.id} className="px-3 py-2 border-r border-slate-100">
                  {w.score === null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className={`font-bold text-sm ${best && best.id === w.id ? "text-amber-600" : "text-slate-700"}`}>
                      {w.score.toFixed(2)}
                      {best && best.id === w.id && <Trophy className="inline w-3.5 h-3.5 ml-1 mb-0.5 text-amber-500" />}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
