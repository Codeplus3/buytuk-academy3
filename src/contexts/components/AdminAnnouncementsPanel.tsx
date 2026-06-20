import { useState, useEffect } from "react";
import { getAnnouncements, saveAnnouncements } from "@/lib/db";
import type { Announcement } from "@/lib/db";
import { toast } from "./Toast";

interface Props { card: React.CSSProperties; }

const EMPTY: Omit<Announcement, "id" | "createdAt" | "createdBy"> = {
  title: "", content: "", type: "info", active: true,
};
const TYPE_OPTS = [
  { v: "info",    l: "معلومة",    c: "#3b82f6" },
  { v: "success", l: "نجاح",      c: "#22c55e" },
  { v: "warning", l: "تحذير",     c: "#f59e0b" },
  { v: "danger",  l: "تنبيه عاجل", c: "#ef4444" },
];

export function AdminAnnouncementsPanel({ card }: Props) {
  const [items,  setItems]  = useState<Announcement[]>([]);
  const [adding, setAdding] = useState(false);
  const [form,   setForm]   = useState(EMPTY);

  const load = () => setItems(getAnnouncements());
  useEffect(load, []);

  const create = () => {
    if (!form.title.trim() || !form.content.trim()) { toast("العنوان والمحتوى مطلوبان", "error"); return; }
    const newItem: Announcement = {
      ...form, id: `ann_${Date.now()}`, createdAt: new Date().toISOString(), createdBy: "admin",
    };
    const all = getAnnouncements();
    all.unshift(newItem);
    saveAnnouncements(all);
    load(); setAdding(false); setForm(EMPTY);
    toast("تم نشر الإعلان ✅", "success");
  };

  const toggle = (id: string, active: boolean) => {
    saveAnnouncements(getAnnouncements().map(a => a.id === id ? { ...a, active } : a));
    load();
  };
  const remove = (id: string) => {
    if (!confirm("حذف هذا الإعلان؟")) return;
    saveAnnouncements(getAnnouncements().filter(a => a.id !== id));
    load();
    toast("تم حذف الإعلان", "warning");
  };

  const inp: React.CSSProperties = { width: "100%", background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "9px 12px", color: "var(--text)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" };
  const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>📢 الإعلانات والتنبيهات</h2>
        <button onClick={() => setAdding(a => !a)}
          style={{ padding: "9px 20px", background: adding ? "rgba(255,71,87,0.1)" : "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: adding ? "1px solid var(--danger)" : "none", borderRadius: "var(--radius-sm)", color: adding ? "var(--danger)" : "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>
          {adding ? "✕ إلغاء" : "+ إعلان جديد"}
        </button>
      </div>

      {adding && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>📋 إعلان جديد</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>نوع الإعلان</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Announcement["type"] }))} style={inp}>
                {TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 20 }}>
              <input type="checkbox" id="activeChk" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              <label htmlFor="activeChk" style={{ fontSize: 13, color: "var(--text)" }}>نشر فوراً</label>
            </div>
          </div>
          <div>
            <label style={lbl}>عنوان الإعلان *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="مثال: إشعار بانتهاء الفصل الدراسي" style={inp} />
          </div>
          <div>
            <label style={lbl}>نص الإعلان *</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={3} placeholder="اكتب تفاصيل الإعلان هنا..." style={{ ...inp, resize: "vertical" }} />
          </div>
          <button onClick={create}
            style={{ padding: "10px 0", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 15 }}>
            📢 نشر الإعلان
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 50 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>📢</div>
          <p style={{ color: "var(--text-muted)" }}>لا توجد إعلانات بعد</p>
        </div>
      ) : items.map(a => {
        const tp = TYPE_OPTS.find(o => o.v === a.type)!;
        return (
          <div key={a.id} style={{ ...card, borderInlineStart: `4px solid ${tp.c}`, opacity: a.active ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{a.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: tp.c, background: `${tp.c}18`, padding: "2px 8px", borderRadius: 99 }}>{tp.l}</span>
                  <span className={`badge ${a.active ? "badge-success" : "badge-warning"}`}>{a.active ? "منشور" : "مخفي"}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7, marginBottom: 6 }}>{a.content}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(a.createdAt).toLocaleString("ar-SA")}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => toggle(a.id, !a.active)}
                  style={{ padding: "6px 12px", background: a.active ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)", border: `1px solid ${a.active ? "var(--warning)" : "var(--success)"}`, borderRadius: 6, color: a.active ? "var(--warning)" : "var(--success)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12 }}>
                  {a.active ? "🙈 إخفاء" : "👁 إظهار"}
                </button>
                <button onClick={() => remove(a.id)}
                  style={{ padding: "6px 12px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12 }}>
                  🗑
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

