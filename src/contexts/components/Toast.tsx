import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
}

let _addToast: ((msg: string, type: ToastType) => void) | null = null;

export function toast(msg: string, type: ToastType = "success") {
  _addToast?.(msg, type);
}

const ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

const COLORS: Record<ToastType, string> = {
  success: "var(--success)",
  error: "var(--danger)",
  warning: "var(--warning)",
  info: "var(--info)",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    _addToast = (msg, type) => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, msg, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };
    return () => { _addToast = null; };
  }, []);

  return (
    <div style={{ position: "fixed", bottom: 24, insetInlineStart: 24, zIndex: 9999, display: "flex", flexDirection: "column-reverse", gap: 10 }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className="toast-item"
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "14px 18px",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-light)",
            border: `1px solid ${COLORS[t.type]}`,
            boxShadow: "var(--shadow)",
            minWidth: 280, maxWidth: 360,
            fontSize: 14, fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 18 }}>{ICONS[t.type]}</span>
          <span style={{ flex: 1 }}>{t.msg}</span>
          <button
            onClick={() => setToasts(prev => prev.filter(i => i.id !== t.id))}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16 }}
          >✕</button>
        </div>
      ))}
    </div>
  );
}
