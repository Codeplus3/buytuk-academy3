import { useState } from "react";
import { sha256, avatarUrl } from "../lib/auth";
import { getParents, saveParents, getStudents } from "../lib/db";
import type { Parent } from "../lib/db";
import { toast } from "./Toast";

interface Props {
  card: React.CSSProperties;
}

const EMPTY_FORM = { name: "", email: "", password: "", studentId: "" };

export function ParentAdminPanel({ card }: Props) {
  const [form, setForm]   = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const parents  = getParents();
  const students = getStudents();

  const filtered = parents.filter(p =>
    p.name.includes(search) || p.email.includes(search)
  );

  const reset = () => { setForm(EMPTY_FORM); setEditId(null); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.studentId) {
      toast("يرجى ملء الاسم والبريد والطالب", "error"); return;
    }
    if (editId === null && !form.password.trim()) {
      toast("يرجى إدخال كلمة المرور", "error"); return;
    }

    const all = getParents();
    if (editId === null && all.some(p => p.email === form.email)) {
      toast("البريد الإلكتروني مستخدم بالفعل", "error"); return;
    }

    const passHash = form.password.trim() ? await sha256(form.password.trim()) : undefined;
    const child = students.find(s => s.id === Number(form.studentId));
    const schoolId = child?.schoolId ?? "";

    if (editId !== null) {
      const updated = all.map(p => p.id === editId
        ? { ...p, name: form.name.trim(), email: form.email.trim(), studentId: Number(form.studentId), schoolId, ...(passHash ? { passHash } : {}) }
        : p
      );
      saveParents(updated);
      toast("تم تحديث بيانات ولي الأمر ✅", "success");
    } else {
      const now = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      const newId = all.length > 0 ? Math.max(...all.map(p => p.id)) + 1 : 1;
      const newParent: Parent = {
        id: newId,
        name: form.name.trim(),
        email: form.email.trim(),
        passHash: passHash!,
        studentId: Number(form.studentId),
        schoolId,
        joinedAt: now,
        status: "active",
      };
      saveParents([...all, newParent]);
      toast("تم إنشاء حساب ولي الأمر ✅", "success");
    }
    reset();
  };

  const startEdit = (p: Parent) => {
    setForm({ name: p.name, email: p.email, password: "", studentId: String(p.studentId) });
    setEditId(p.id);
  };

  const del = (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الحساب؟")) return;
    saveParents(getParents().filter(p => p.id !== id));
    toast("تم حذف الحساب", "info");
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--glass-bg)",
    color: "var(--text)", fontFamily: "inherit", fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };
  const btn = (color: string, outline = false): React.CSSProperties => ({
    padding: "10px 20px", borderRadius: 8,
    border: outline ? "1px solid var(--border)" : "none",
    cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700,
    background: outline ? "transparent" : color,
    color: outline ? "var(--text-muted)" : "#fff",
  });

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>👨‍👩‍👧 أولياء الأمور</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        أنشئ حسابات أولياء الأمور وربطها بالطلاب
      </p>

      {/* ── FORM ── */}
      <div style={{ ...card, marginBottom: 28, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          {editId !== null ? "✏️ تعديل حساب ولي الأمر" : "➕ إضافة ولي أمر جديد"}
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>الاسم الكامل *</label>
            <input style={inp} placeholder="اسم ولي الأمر" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>البريد الإلكتروني *</label>
            <input style={inp} type="email" placeholder="parent@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>كلمة المرور {editId !== null ? "(فارغة = لا تغيير)" : "*"}</label>
            <input style={inp} type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>الطالب المرتبط *</label>
            <select style={inp} value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}>
              <option value="">— اختر الطالب —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={btn("var(--primary)")} onClick={handleSave}>
            {editId !== null ? "💾 حفظ التعديلات" : "➕ إنشاء الحساب"}
          </button>
          {editId !== null && (
            <button style={btn("", true)} onClick={reset}>إلغاء</button>
          )}
        </div>
      </div>

      {/* ── LIST ── */}
      <div style={{ ...card, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontWeight: 700 }}>أولياء الأمور المسجلون ({parents.length})</span>
          <input style={{ ...inp, width: 220 }} placeholder="🔍 بحث..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0", fontSize: 14 }}>
            لا يوجد أولياء أمور مسجلون بعد
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>البريد الإلكتروني</th>
                <th>الطالب المرتبط</th>
                <th>الحالة</th>
                <th>تاريخ الانضمام</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const child = students.find(s => s.id === p.studentId);
                return (
                  <tr key={p.id}>
                    <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <img src={avatarUrl(p.name)} alt="" style={{ width: 30, height: 30, borderRadius: "50%" }} />
                      {p.name}
                    </td>
                    <td>{p.email}</td>
                    <td>
                      {child ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <img src={avatarUrl(child.name)} alt="" style={{ width: 22, height: 22, borderRadius: "50%" }} />
                          {child.name}
                        </span>
                      ) : (
                        <span style={{ color: "var(--danger)", fontSize: 12 }}>⚠️ غير موجود</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${p.status === "active" ? "badge-success" : "badge-danger"}`}>
                        {p.status === "active" ? "فعّال" : "محظور"}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{p.joinedAt}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => startEdit(p)} style={{ padding: "5px 12px", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: 6, color: "var(--primary)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✏️ تعديل</button>
                      <button onClick={() => del(p.id)} style={{ padding: "5px 12px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 6, color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🗑 حذف</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
