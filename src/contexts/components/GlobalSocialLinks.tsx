/**
 * GlobalSocialLinks
 * ──────────────────────────────────────────────────────────────────
 * Platform-wide social / contact links bar.
 * Always shows the same links for ALL users (school/platform official).
 *
 * Links are loaded from localStorage (admin-editable) with fallback to
 * the hardcoded PLATFORM_SOCIAL_LINKS.  Listens to the custom event
 * "buytuk:social-links-changed" so changes by AdminSettingsPanel are
 * reflected immediately without a page reload.
 *
 * Icons are inline SVG — no external library required, works offline.
 * Uses Logical CSS (marginInlineStart / paddingInline) for RTL support.
 */
import { useState, useEffect } from "react";
import { getSocialLinks } from "../lib/social-config";
import type { SocialLink } from "../lib/social-config";

/* ── Inline SVG icons keyed by social-config id ───────────────── */
function SocialIcon({ id, size = 16 }: { id: string; size?: number }) {
  const s = size;
  switch (id) {
    case "facebook":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      );
    case "telegram":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      );
    case "whatsapp":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case "youtube":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" /><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="#fff"/>
        </svg>
      );
    case "instagram":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
      );
    default:
      return <span style={{ fontSize: s * 0.75 }}>🔗</span>;
  }
}

interface Props {
  /** compact = icon-only; default = icon + label */
  compact?: boolean;
}

export function GlobalSocialLinks({ compact = true }: Props) {
  const [links, setLinks] = useState<SocialLink[]>(() => getSocialLinks());

  /* Re-read links whenever admin saves them */
  useEffect(() => {
    const refresh = () => setLinks(getSocialLinks());
    window.addEventListener("buytuk:social-links-changed", refresh);
    return () => window.removeEventListener("buytuk:social-links-changed", refresh);
  }, []);

  return (
    <div
      aria-label="تواصل مع المنصة"
      style={{
        marginBlockStart: 12,
        paddingBlockStart: 12,
        borderBlockStart:  "1px solid var(--glass-border)",
      }}
    >
      {!compact && (
        <p
          style={{
            fontSize:       10,
            color:          "var(--text-muted)",
            marginBlockEnd: 8,
            paddingInlineStart: 4,
            letterSpacing:  "0.04em",
            textTransform:  "uppercase",
          }}
        >
          تواصل معنا
        </p>
      )}

      <div
        style={{
          display:        "flex",
          flexWrap:       "wrap",
          gap:            6,
          justifyContent: "center",
        }}
      >
        {links.map(link => (
          <a
            key={link.id}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            title={link.label}
            aria-label={link.label}
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              gap:            compact ? 0 : 6,
              width:          compact ? 32 : "auto",
              height:         32,
              paddingInline:  compact ? 0 : 10,
              borderRadius:   "var(--radius-sm)",
              background:     `${link.color}18`,
              border:         `1px solid ${link.color}44`,
              color:          link.color,
              textDecoration: "none",
              fontSize:       11,
              fontWeight:     700,
              transition:     "background 0.18s, transform 0.15s",
              flexShrink:     0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = `${link.color}30`;
              (e.currentTarget as HTMLAnchorElement).style.transform   = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = `${link.color}18`;
              (e.currentTarget as HTMLAnchorElement).style.transform   = "translateY(0)";
            }}
          >
            <SocialIcon id={link.id} size={15} />
            {!compact && <span>{link.label}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}
