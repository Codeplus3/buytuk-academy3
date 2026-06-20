import { useState } from "react";
import { sha256, avatarUrl } from "../lib/auth";
import { getSupportAgents, saveSupportAgents } from "../lib/db";
import type { SupportAgent } from "../lib/db";
import { toast } from "./Toast";

interface Props {
  card: React.CSSProperties;
}

const EMPTY_FORM = { name: "", email: "", password: "", phone: "" };

export function SupportAdminPanel({ card }: Props) {
  const [form, setForm]     = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const agents   = getSupportAgents();
  const filtered = agents.filter(a => a.name.includes(search) || a.email.includes(search));

  const reset = () => { setForm(EMPTY_FORM); setEditId(null); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast("يرجى ملء الاسم والبريد الإلكتروني", "error"); return;
    }
    if (editId === null && !form.password.trim()) {
      toast("يرجى إدخال كلمة المرور", "error"); return;
    }
    const all = getSupportAgents();
    if (editId === null && all.some(a => a.email === form.email)) {
      toast("البريد الإلكتروني مستخدم بالفعل", "error"); return;
    }
    const passHash = form.password.trim() ? await sha256(form.password.trim()) : undefined;

    if (editId !== null) {
      const updated = all.map(a => a.id === editId
        ? { ...a, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, ...(passHash ? { passHash } : {}) }
        : a
      );
      saveSupportAgents(updated);
      toast("تم تحديث بيانات موظف الدعم ✅", "success");
    } else {
      const now   = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      const newId = all.length > 0 ? Math.max(...all.map(a => a.id)) + 1 : 1;
      const agent: SupportAgent = {
        id:       newId,
        name:     form.name.trim(),
        email:    form.email.trim(),
        passHash: passHash!,
        joinedAt: now,
        status:   "active",
        phone:    form.phone.trim() || undefined,
      };
      saveSupportAgents([...all, agent]);
      toast("تم إنشاء حساب موظف الدعم ✅", "success");
    }
    reset();
  };

  const toggleStatus = (id: number) => {
    const updated = getSupportAgents().map(a =>
      a.id === id ? { ...a, status: a.status === "active" ? "blocked" as const : "active" as const } : a
    );
    saveSupportAgents(updated);
    toast("تم تحديث الحالة", "info");
  };

  const del = (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الحساب؟")) return;
    saveSupportAgents(getSupportAgents().filter(a => a.id !== id));
    toast("تم حذف الحساب", "info");
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--glass-bg)",
    color: "var(--text)", fontFamily: "inherit", fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };
  const btnStyle = (bg: string, outline = false): React.CSSProperties => ({
    padding: "10px 20px", borderRadius: 8, cursor: "pointer",
    fontFamily: "inherit", fontSize: 14, fontWeight: 700,
    background: outline ? "transparent" : bg,
    color: outline ? "var(--text-muted)" : "#fff",
    border: outline ? "1px solid var(--border)" : "none",
  });

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🎧 موظفو الدعم الفني</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        أنشئ حسابات فريق الدعم وأدّر صلاحياتهم — يملكون وصولاً لمذكرات الدعم فقط
      </p>

      {/* ── FORM ── */}
      <div style={{ ...card, marginBottom: 28, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          {editId !== null ? "✏️ تعديل حساب موظف الدعم" : "➕ إضافة موظف دعم جديد"}
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>الاسم الكامل *</label>
            <input style={inp} placeholder="اسم الموظف" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>البريد الإلكتروني *</label>
            <input style={inp} type="email" placeholder="support@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>كلمة المرور {editId !== null ? "(فارغة = لا تغيير)" : "*"}</label>
            <input style={inp} type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>رقم الهاتف (اختياري)</label>
            <input style={inp} type="tel" placeholder="05xxxxxxxx" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btnStyle("var(--primary)")} onClick={handleSave}>
            {editId !== null ? "💾 حفظ التعديلات" : "➕ إنشاء الحساب"}
          </button>
          {editId !== null && <button style={btnStyle("", true)} onClick={reset}>إلغاء</button>}
        </div>
      </div>

      {/* ── LIST ── */}
      <div style={{ ...card, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700 }}>موظفو الدعم ({agents.length})</span>
          <input style={{ ...inp, width: 220 }} placeholder="🔍 بحث..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0", fontSize: 14 }}>
            لا يوجد موظفو دعم بعد
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>الاسم</th><th>البريد</th><th>الهاتف</th><th>الحالة</th><th>تاريخ الانضمام</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id}>
                  <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <img src={avatarUrl(a.name)} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />
                    {a.name}
                  </td>
                  <td>{a.email}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{a.phone ?? "—"}</td>
                  <td>
                    <span className={`badge ${a.status === "active" ? "badge-success" : "badge-danger"}`}>
                      {a.status === "active" ? "فعّال" : "محظور"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{a.joinedAt}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setForm({ name: a.name, email: a.email, password: "", phone: a.phone ?? "" }); setEditId(a.id); }} style={{ padding: "5px 10px", borderRadius: 6, background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", color: "var(--primary)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✏️</button>
                    <button onClick={() => toggleStatus(a.id)} style={{ padding: "5px 10px", borderRadius: 6, background: a.status === "active" ? "rgba(255,71,87,0.08)" : "rgba(0,200,150,0.08)", border: `1px solid ${a.status === "active" ? "var(--danger)" : "var(--success)"}`, color: a.status === "active" ? "var(--danger)" : "var(--success)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                      {a.status === "active" ? "🔒" : "✅"}
                    </button>
                    <button onClick={() => del(a.id)} style={{ padding: "5px 10px", borderRadius: 6, background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", color: "var(--danger)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
