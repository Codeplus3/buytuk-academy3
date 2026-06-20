import { useState, useMemo } from "react";
import type { Student, Subject, StudyNote } from "../lib/db";
import { getStudyNotes, saveStudyNotes } from "../lib/db";
import { toast } from "./Toast";

interface Props { student: Student; subjects: Subject[]; card: React.CSSProperties; }

type NoteColor = StudyNote["color"];

const COLOR_MAP: Record<NoteColor, { bg: string; border: string; label: string }> = {
  default: { bg: "var(--card)",              border: "var(--border)",    label: "افتراضي" },
  yellow:  { bg: "rgba(245,158,11,0.08)",    border: "rgba(245,158,11,0.4)", label: "أصفر" },
  green:   { bg: "rgba(16,185,129,0.08)",    border: "rgba(16,185,129,0.4)", label: "أخضر" },
  blue:    { bg: "rgba(59,130,246,0.08)",    border: "rgba(59,130,246,0.4)", label: "أزرق" },
  pink:    { bg: "rgba(236,72,153,0.08)",    border: "rgba(236,72,153,0.4)", label: "وردي" },
};

const EMPTY = { title: "", body: "", subjectId: "", color: "default" as NoteColor };

export function StudyNotesPanel({ student, subjects, card }: Props) {
  const [notes, setNotes]         = useState<StudyNote[]>(() => getStudyNotes(student.id));
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState(EMPTY);
  const [filterSub, setFilterSub] = useState("");
  const [search, setSearch]       = useState("");
  const [showForm, setShowForm]   = useState(false);

  const persist = (updated: StudyNote[]) => {
    saveStudyNotes(student.id, updated);
    setNotes(updated);
  };

  const filtered = useMemo(() =>
    notes
      .filter(n => !filterSub || n.subjectId === filterSub)
      .filter(n => !search || n.title.includes(search) || n.body.includes(search))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes, filterSub, search],
  );

  const handleSave = () => {
    if (!form.title.trim()) { toast("يرجى كتابة عنوان للملاحظة", "error"); return; }
    const sub = subjects.find(s => s.id === form.subjectId);
    const now = new Date().toISOString();

    if (editId) {
      persist(notes.map(n => n.id === editId
        ? { ...n, ...form, subjectName: sub?.name ?? "عام", updatedAt: now }
        : n,
      ));
      toast("تم تحديث الملاحظة ✅", "success");
    } else {
      const newNote: StudyNote = {
        id: `note_${Date.now()}`,
        studentId: student.id,
        subjectId: form.subjectId,
        subjectName: sub?.name ?? "عام",
        title: form.title.trim(),
        body: form.body,
        color: form.color,
        createdAt: now,
        updatedAt: now,
      };
      persist([newNote, ...notes]);
      toast("تمت إضافة الملاحظة ✅", "success");
    }
    setForm(EMPTY);
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (n: StudyNote) => {
    setForm({ title: n.title, body: n.body, subjectId: n.subjectId, color: n.color });
    setEditId(n.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm("حذف هذه الملاحظة؟")) return;
    persist(notes.filter(n => n.id !== id));
    toast("تم الحذف", "warning");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" style={{ fontSize: 13 }}
          onClick={() => { setShowForm(p => !p); setEditId(null); setForm(EMPTY); }}>
          {showForm ? "✕ إلغاء" : "➕ ملاحظة جديدة"}
        </button>
        <input className="form-input" style={{ flex: 1, minWidth: 160, margin: 0 }}
          placeholder="🔍 بحث في الملاحظات…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-input" style={{ margin: 0, minWidth: 140 }}
          value={filterSub} onChange={e => setFilterSub(e.target.value)}>
          <option value="">كل المواد</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{notes.length} ملاحظة</span>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ ...card, border: "2px solid var(--primary)", background: "rgba(108,99,255,0.04)" }}>
          <h4 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>
            {editId ? "✏️ تعديل الملاحظة" : "➕ ملاحظة جديدة"}
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label className="form-label">العنوان</label>
              <input className="form-input" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="عنوان الملاحظة…" />
            </div>
            <div>
              <label className="form-label">المادة (اختياري)</label>
              <select className="form-input" value={form.subjectId}
                onChange={e => setForm(p => ({ ...p, subjectId: e.target.value }))}>
                <option value="">— عام —</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">لون البطاقة</label>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {(Object.keys(COLOR_MAP) as NoteColor[]).map(c => (
                  <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                    title={COLOR_MAP[c].label}
                    style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: COLOR_MAP[c].bg,
                      border: `3px solid ${form.color === c ? "var(--primary)" : COLOR_MAP[c].border}`,
                      cursor: "pointer",
                    }} />
                ))}
              </div>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label className="form-label">المحتوى</label>
              <textarea className="form-input" rows={5} value={form.body}
                onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
                placeholder="اكتب ملاحظاتك هنا… يدعم النص العادي" />
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleSave}>
            {editId ? "💾 حفظ التعديلات" : "➕ إضافة الملاحظة"}
          </button>
        </div>
      )}

      {/* Notes grid */}
      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-muted)" }}>
            {notes.length === 0 ? "لا توجد ملاحظات بعد" : "لا توجد نتائج للبحث"}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
            {notes.length === 0 && "اضغط «ملاحظة جديدة» لبدء التدوين"}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {filtered.map(n => (
            <div key={n.id} style={{
              borderRadius: "var(--radius)",
              border: `1px solid ${COLOR_MAP[n.color].border}`,
              background: COLOR_MAP[n.color].bg,
              padding: 18,
              display: "flex", flexDirection: "column", gap: 8,
              position: "relative",
            }}>
              {/* Subject badge */}
              {n.subjectName && n.subjectId && (
                <span className="badge badge-info" style={{ alignSelf: "flex-start", fontSize: 11 }}>
                  📚 {n.subjectName}
                </span>
              )}

              <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.4 }}>{n.title}</div>

              {n.body && (
                <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, flex: 1, whiteSpace: "pre-wrap", maxHeight: 120, overflow: "hidden" }}>
                  {n.body}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {new Date(n.updatedAt).toLocaleDateString("ar-EG")}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => handleEdit(n)}
                    style={{ fontSize: 12, padding: "4px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>
                    ✏️
                  </button>
                  <button onClick={() => handleDelete(n.id)}
                    style={{ fontSize: 12, padding: "4px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid var(--danger)", borderRadius: 6, cursor: "pointer", color: "var(--danger)" }}>
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
