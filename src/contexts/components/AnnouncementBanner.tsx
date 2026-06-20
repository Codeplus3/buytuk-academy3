import { useState, useEffect } from "react";
import { getAnnouncements } from "../lib/db";
import type { Announcement } from "../lib/db";

const TYPE_STYLE: Record<Announcement["type"], { bg: string; border: string; color: string; icon: string }> = {
  info:    { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.35)",  color: "#3b82f6", icon: "ℹ️" },
  success: { bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.35)",   color: "#22c55e", icon: "✅" },
  warning: { bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.35)",  color: "#f59e0b", icon: "⚠️" },
  danger:  { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.35)",   color: "#ef4444", icon: "🚨" },
};

export function AnnouncementBanner() {
  const [items, setItems]       = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = () => setItems(getAnnouncements().filter(a => a.active));

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("buytuk:announcements-changed", h);
    return () => window.removeEventListener("buytuk:announcements-changed", h);
  }, []);

  const visible = items.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
      {visible.map(a => {
        const s = TYPE_STYLE[a.type];
        return (
          <div key={a.id} style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: "12px 16px",
            background: s.bg, border: `1px solid ${s.border}`,
            borderRadius: "var(--radius-sm)",
            animation: "fadeIn 0.3s ease",
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: s.color, marginBottom: 2 }}>{a.title}</div>
              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{a.content}</div>
            </div>
            <button onClick={() => setDismissed(d => new Set([...d, a.id]))}
              style={{ background: "none", border: "none", color: s.color, cursor: "pointer", fontSize: 16, flexShrink: 0, padding: 0, lineHeight: 1 }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}
