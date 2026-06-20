import { useState, useEffect, useRef } from "react";
import { getNotifications, saveNotifications } from "../lib/db";
import type { AppNotification } from "../lib/db";

interface Props { studentId: number; }

const TYPE_ICON: Record<AppNotification["type"], string> = {
  message: "💬", homework: "📝", exam: "📋", badge: "🏅", announcement: "📢",
};

export function NotificationCenter({ studentId }: Props) {
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [open,   setOpen]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => setNotifs(getNotifications(studentId));

  useEffect(() => {
    load();
    const h = (e: Event) => { if ((e as CustomEvent).detail?.studentId === studentId) load(); };
    window.addEventListener("buytuk:notifs-changed", h);
    return () => window.removeEventListener("buytuk:notifs-changed", h);
  }, [studentId]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const unread = notifs.filter(n => !n.read).length;

  const markAll = () => {
    const updated = notifs.map(n => ({ ...n, read: true }));
    saveNotifications(studentId, updated);
    setNotifs(updated);
  };

  const markOne = (id: string) => {
    const updated = notifs.map(n => n.id === id ? { ...n, read: true } : n);
    saveNotifications(studentId, updated);
    setNotifs(updated);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ position: "relative", background: "rgba(255,255,255,0.05)", border: "1px solid var(--glass-border)", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18 }}>
        🔔
        {unread > 0 && (
          <span style={{ position: "absolute", top: -4, insetInlineEnd: -4, minWidth: 18, height: 18, borderRadius: 99, background: "var(--danger)", color: "#fff", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", insetInlineEnd: 0, width: 320,
          background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 1000, overflow: "hidden",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--glass-border)" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>🔔 الإشعارات {unread > 0 && <span style={{ fontSize: 11, color: "var(--primary)" }}>({unread} جديدة)</span>}</span>
            {unread > 0 && <button onClick={markAll} style={{ fontSize: 11, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>قراءة الكل</button>}
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {notifs.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔕</div>
                لا توجد إشعارات بعد
              </div>
            ) : notifs.map(n => (
              <div key={n.id}
                onClick={() => markOne(n.id)}
                style={{
                  display: "flex", gap: 12, padding: "12px 16px",
                  borderBottom: "1px solid var(--glass-border)",
                  background: n.read ? "transparent" : "rgba(108,99,255,0.06)",
                  cursor: "pointer", transition: "background 0.15s",
                }}>
                <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{TYPE_ICON[n.type]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: n.read ? 500 : 700, fontSize: 13, marginBottom: 2 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{n.body}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{new Date(n.createdAt).toLocaleString("ar-SA")}</div>
                </div>
                {!n.read && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary)", flexShrink: 0, marginTop: 6 }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
