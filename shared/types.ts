// Shared types used by both client and server

export interface Listing {
  id: number;
  url: string;
  wojewodztwo: string;
  powiat: string;
  gmina: string;
  miejscowosc: string;
  rozmiarDzialki: string;
  media: string;
  przeznaczenie: string;
  zabudowania: string;
  cena: string;
  latitude: string | null;
  longitude: string | null;
  notes: string | null;
  archived: boolean;
  flagged: boolean;
  status: string;
  pros: string | null;
  cons: string | null;
  distanceKm: number | null;
  distanceMin: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RatingStats = Record<number, { avg: number; count: number }>;

// ─── Status pipeline ──────────────────────────────────────────────────────────

export type ListingStatus = "nowy" | "do_kontaktu" | "obejrzany" | "odrzucony" | "oferta_zlozona";

export const LISTING_STATUSES: {
  key: ListingStatus;
  label: string;
  /** Base color used for badges / dropdown */
  color: string;
  /** Background used in compact UI chips */
  bg: string;
  border: string;
  text: string;
}[] = [
  { key: "nowy",           label: "Nowy",           color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0", text: "#475569" },
  { key: "do_kontaktu",    label: "Do kontaktu",    color: "#eab308", bg: "#fef9c3", border: "#fde68a", text: "#92400e" },
  { key: "obejrzany",      label: "Obejrzany",      color: "#3b82f6", bg: "#dbeafe", border: "#bfdbfe", text: "#1d4ed8" },
  { key: "oferta_zlozona", label: "Oferta złożona", color: "#22c55e", bg: "#dcfce7", border: "#bbf7d0", text: "#15803d" },
  { key: "odrzucony",      label: "Odrzucony",      color: "#ef4444", bg: "#fee2e2", border: "#fecaca", text: "#b91c1c" },
];

export function getStatusMeta(status: string) {
  return LISTING_STATUSES.find(s => s.key === status) ?? LISTING_STATUSES[0];
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export interface TagInfo {
  id: number;
  name: string;
  color: string;
}

/** Tailwind-friendly pill colors for tags */
export const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  green:  { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },
  blue:   { bg: "#dbeafe", text: "#1e40af", border: "#bfdbfe" },
  red:    { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },
  yellow: { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" },
  purple: { bg: "#f3e8ff", text: "#6b21a8", border: "#e9d5ff" },
  pink:   { bg: "#fce7f3", text: "#9d174d", border: "#fbcfe8" },
  orange: { bg: "#ffedd5", text: "#9a3412", border: "#fed7aa" },
  teal:   { bg: "#ccfbf1", text: "#115e59", border: "#99f6e4" },
  slate:  { bg: "#f1f5f9", text: "#334155", border: "#e2e8f0" },
};

// ─── Notes / threads ──────────────────────────────────────────────────────────

export interface NoteEntry {
  id: number;
  listingId: number;
  parentId: number | null;
  userId: number | null;
  userName: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Activity log ─────────────────────────────────────────────────────────────

export interface ActivityItem {
  id: number;
  listingId: number | null;
  userId: number | null;
  userName: string | null;
  action: string;
  detail: string | null;
  createdAt: Date;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: number;
  userId: number;
  listingId: number | null;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: Date;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export interface CriterionInfo {
  id: number;
  name: string;
  weight: number;
  sortOrder: number;
}

/** listingId → { criterionId → score } */
export type CriterionScores = Record<number, Record<number, number>>;

/** Compute weighted score (0–5) for a listing. Returns null if no scores set. */
export function computeWeightedScore(
  criteria: CriterionInfo[],
  scores: Record<number, number> | undefined
): number | null {
  if (!scores || criteria.length === 0) return null;
  let totalWeight = 0;
  let sum = 0;
  for (const c of criteria) {
    const s = scores[c.id];
    if (s === undefined || s === null) continue;
    totalWeight += c.weight;
    sum += s * c.weight;
  }
  if (totalWeight === 0) return null;
  return sum / totalWeight;
}

// ─── Areas of interest (map polygons) ─────────────────────────────────────────

export interface AreaInfo {
  id: number;
  name: string;
  color: string;
  /** JSON-encoded array of {lat,lng} points */
  path: string;
}

/** Parse the JSON path of an area into coordinates (defensive). */
export function parseAreaPath(path: string): { lat: number; lng: number }[] {
  try {
    const arr = JSON.parse(path);
    if (!Array.isArray(arr)) return [];
    return arr.filter(p => typeof p?.lat === "number" && typeof p?.lng === "number");
  } catch {
    return [];
  }
}
