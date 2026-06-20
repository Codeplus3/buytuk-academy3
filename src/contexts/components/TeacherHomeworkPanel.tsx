import { useState, useEffect } from "react";
import { getHomework, saveHomework, getHomeworkSubmissions, saveHomeworkSubmissions } from "../lib/db";
import type { Teacher, Subject, Homework, HomeworkSubmission } from "../lib/db";
import { toast } from "./Toast";

interface Props { teacher: Teacher; mySubjects: Subject[]; card: React.CSSProperties; }

const EMPTY: Omit<Homework, "id" | "createdAt"> = {
  subjectId: "", subjectName: "", teacherId: 0, teacherName: "",
  title: "", description: "", dueDate: "", maxPoints: 10,
  stage: "secondary", grade: 1, track: "all", schoolId: "all", status: "active",
};

export function TeacherHomeworkPanel({ teacher, mySubjects, card }: Props) {
  const [hw,      setHw]      = useState<Homework[]>([]);
  const [subs,    setSubs]    = useState<HomeworkSubmission[]>([]);
  const [adding,  setAdding]  = useState(false);
  const [form,    setForm]    = useState(EMPTY);
  const [viewHw,  setViewHw]  = useState<string | null>(null);
  const [grading, setGrading] = useState<{ subId: string; grade: string; feedback: string } | null>(null);

  const load = () => {
    setHw(getHomework().filter(h => h.teacherId === teacher.id));
    setSubs(getHomeworkSubmissions());
  };
  useEffect(load, [teacher.id]);

  const create = () => {
    if (!form.title.trim() || !form.subjectId || !form.dueDate) {
      toast("الرجاء ملء الحقول المطلوبة (العنوان، المادة، تاريخ التسليم)", "error"); return;
    }
    const subj = mySubjects.find(s => s.id === form.subjectId);
    if (!subj) return;
    const newHw: Homework = {
      ...form,
      id:          `hw_${Date.now()}`,
      subjectName: subj.name,
      teacherId:   teacher.id,
      teacherName: teacher.name,
      stage:       subj.stage,
      grade:       subj.grade,
      track:       subj.track ?? "all",
      schoolId:    subj.schoolId ?? "all",
      createdAt:   new Date().toISOString(),
    };
    const all = getHomework();
    all.push(newHw);
    saveHomework(all);
    load();
    setAdding(false);
    setForm(EMPTY);
    toast("تم إنشاء الواجب ✅", "success");
  };

  const toggle = (id: string, status: "active" | "closed") => {
    saveHomework(getHomework().map(h => h.id === id ? { ...h, status } : h));
    load();
  };

  const saveGrade = (sub: HomeworkSubmission) => {
    if (!grading) return;
    const g = Number(grading.grade);
    const all = getHomeworkSubmissions();
    const idx = all.findIndex(s => s.id === sub.id);
    if (idx >= 0) { all[idx] = { ...all[idx], grade: g, feedback: grading.feedback }; }
    saveHomeworkSubmissions(all);
    setSubs(all);
    setGrading(null);
    toast("تم تسجيل الدرجة ✅", "success");
  };

  const inpStyle: React.CSSProperties = { width: "100%", background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "9px 12px", color: "var(--text)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" };
  const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>📝 الواجبات المنزلية</h2>
        <button onClick={() => setAdding(a => !a)}
          style={{ padding: "9px 20px", background: adding ? "rgba(255,71,87,0.1)" : "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: adding ? "1px solid var(--danger)" : "none", borderRadius: "var(--radius-sm)", color: adding ? "var(--danger)" : "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>
          {adding ? "✕ إلغاء" : "+ إنشاء واجب جديد"}
        </button>
      </div>

      {/* Create form */}
      {adding && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>📋 واجب جديد</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>المادة *</label>
              <select value={form.subjectId} onChange={e => setForm(f => ({ ...f, subjectId: e.target.value }))} style={inpStyle}>
                <option value="">اختر مادة...</option>
                {mySubjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>تاريخ التسليم *</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={inpStyle} />
            </div>
          </div>
          <div>
            <label style={lbl}>عنوان الواجب *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="مثال: حل تمارين الوحدة الثالثة" style={inpStyle} />
          </div>
          <div>
            <label style={lbl}>تعليمات الواجب</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="اشرح ما يجب على الطالب فعله..." style={{ ...inpStyle, resize: "vertical" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>الدرجة القصوى</label>
              <input type="number" min={1} max={100} value={form.maxPoints} onChange={e => setForm(f => ({ ...f, maxPoints: Number(e.target.value) }))} style={inpStyle} />
            </div>
          </div>
          <button onClick={create}
            style={{ padding: "10px 0", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 15 }}>
            ✅ إنشاء الواجب
          </button>
        </div>
      )}

      {/* Homework list */}
      {hw.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 50 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>📝</div>
          <p style={{ color: "var(--text-muted)" }}>لم تُنشئ أي واجبات بعد</p>
        </div>
      ) : hw.map(h => {
        const hSubs = subs.filter(s => s.homeworkId === h.id);
        const isView = viewHw === h.id;
        return (
          <div key={h.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{h.title}</span>
                  <span className={`badge ${h.status === "active" ? "badge-success" : "badge-warning"}`}>{h.status === "active" ? "نشط" : "مغلق"}</span>
                  <span className="badge badge-info">{hSubs.length} تسليم</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{h.subjectName} · التسليم: {new Date(h.dueDate).toLocaleDateString("ar-SA")} · {h.maxPoints} درجة</div>
                {h.description && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{h.description}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => setViewHw(isView ? null : h.id)}
                  style={{ padding: "6px 12px", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: 6, color: "var(--primary)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12 }}>
                  {isView ? "إخفاء" : `📋 التسليمات (${hSubs.length})`}
                </button>
                <button onClick={() => toggle(h.id, h.status === "active" ? "closed" : "active")}
                  style={{ padding: "6px 12px", background: h.status === "active" ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)", border: `1px solid ${h.status === "active" ? "var(--warning)" : "var(--success)"}`, borderRadius: 6, color: h.status === "active" ? "var(--warning)" : "var(--success)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12 }}>
                  {h.status === "active" ? "🔒 إغلاق" : "🔓 فتح"}
                </button>
              </div>
            </div>

            {isView && (
              <div style={{ borderTop: "1px solid var(--glass-border)", padding: "14px 20px" }}>
                <h5 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-muted)" }}>التسليمات ({hSubs.length})</h5>
                {hSubs.length === 0 ? <p style={{ fontSize: 13, color: "var(--text-muted)" }}>لا توجد تسليمات بعد</p>
                : hSubs.map(sub => (
                  <div key={sub.id} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{sub.studentName}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {sub.grade !== undefined
                          ? <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 700 }}>✅ {sub.grade}/{h.maxPoints}</span>
                          : <button onClick={() => setGrading({ subId: sub.id, grade: "", feedback: "" })}
                              style={{ padding: "4px 10px", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: 6, color: "var(--primary)", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>تصحيح</button>
                        }
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{sub.answer}</div>
                    {grading?.subId === sub.id && (
                      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="number" min={0} max={h.maxPoints} placeholder="الدرجة" value={grading.grade}
                          onChange={e => setGrading(g => g ? { ...g, grade: e.target.value } : g)}
                          style={{ ...inpStyle, width: 80 }} />
                        <input placeholder="ملاحظات (اختياري)" value={grading.feedback}
                          onChange={e => setGrading(g => g ? { ...g, feedback: e.target.value } : g)}
                          style={{ ...inpStyle, flex: 1 }} />
                        <button onClick={() => saveGrade(sub)}
                          style={{ padding: "8px 14px", background: "var(--success)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>حفظ</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
