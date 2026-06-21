/**
 * UserAvatar
 * ──────────────────────────────────────────────────────────────────
 * Smart avatar that shows a photo if `src` is provided (or falls back
 * to a colored initials circle).  Works fully offline — no external
 * service required.
 *
 * Priority:
 *   1. `src` prop (custom photo URL) — shows image, onError → fallback
 *   2. Initials fallback — first character of `name`, coloured circle
 */
import { useState } from "react";

/* ── colour palette (matches auth.ts avatarUrl) ─────────────────── */
const COLOURS = ["#6c63ff", "#f093fb", "#00c896", "#54a0ff", "#ffa502", "#ff4757"];
function colourFor(name: string): string {
  const index = name?.charCodeAt(0) ?? 0;
  return COLOURS[index % COLOURS.length] ?? "#6c63ff";
}
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

interface Props {
  name:   string;
  src?:   string | null;
  size?:  number;
  border?: string;
  style?: React.CSSProperties;
}

export function UserAvatar({ name, src, size = 36, border, style }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  const showImage = !!(src && !imgFailed);
  const bg        = colourFor(name);
  const dim: React.CSSProperties = {
    width:        size,
    height:       size,
    borderRadius: "50%",
    flexShrink:   0,
    overflow:     "hidden",
    border:       border ?? "2px solid var(--primary)",
    ...style,
  };

  if (showImage) {
    return (
      <img
        src={src!}
        alt={name}
        style={{ ...dim, objectFit: "cover" }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      aria-label={name}
      style={{
        ...dim,
        background:     bg,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       Math.round(size * 0.42),
        fontWeight:     800,
        color:          "#fff",
        userSelect:     "none",
        letterSpacing:  "0.02em",
      }}
    >
      {initial(name)}
    </div>
  );
}
