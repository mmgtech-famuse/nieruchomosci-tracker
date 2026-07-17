/**
 * Tiny initials avatar used next to notes and ratings to clarify who did what.
 * Deterministic color per name so each family member has a stable identity color.
 */

const AVATAR_COLORS = [
  { bg: "#dbeafe", text: "#1d4ed8" }, // blue
  { bg: "#dcfce7", text: "#15803d" }, // green
  { bg: "#fef9c3", text: "#a16207" }, // yellow
  { bg: "#fce7f3", text: "#be185d" }, // pink
  { bg: "#f3e8ff", text: "#7e22ce" }, // purple
  { bg: "#ffedd5", text: "#c2410c" }, // orange
  { bg: "#ccfbf1", text: "#0f766e" }, // teal
];

export function nameToColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserBadge({
  name,
  size = 16,
  title,
}: {
  name: string | null | undefined;
  size?: number;
  title?: string;
}) {
  if (!name) return null;
  const color = nameToColor(name);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold flex-shrink-0 select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(7, Math.round(size * 0.45)),
        background: color.bg,
        color: color.text,
        border: `1px solid ${color.text}22`,
        lineHeight: 1,
      }}
      title={title ?? name}
    >
      {getInitials(name)}
    </span>
  );
}
