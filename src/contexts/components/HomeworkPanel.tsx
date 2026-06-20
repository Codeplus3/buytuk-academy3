import { useState, useEffect } from "react";
import { getHomeworkForStudent, getHomeworkSubmissions, saveHomeworkSubmissions } from "@/lib/db";
import type { Student, Homework, HomeworkSubmission } from "@/lib/db";
import { toast } from "./Toast";

interface Props { student: Student; card: React.CSSProperties; }

export function HomeworkPanel({ student, card }: Props) {
  const [hw,   setHw]   = useState<Homework[]>([]);
  const [subs, setSubs] = useState<HomeworkSubmission[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [ans,  setAns]  = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setHw(getHomeworkForStudent(student));
    setSubs(getHomeworkSubmissions().filter(s => s.studentEmail === student.email));
  };
  useEffect(load, [student.email, student.stage, student.grade, student.track, student.schoolId]);

  const getSubmission = (hwId: string) => subs.find(s => s.homeworkId === hwId);

  const submit = (h: Homework) => {
    if (!ans.trim()) { toast("أدخل إجابتك أولاً", "error"); return; }
    setSubmitting(true);
    const sub: HomeworkSubmission = {
      id:           `sub_${Date.now()}`,
      homeworkId:   h.id,
      studentId:    student.id,
      studentEmail: student.email,
      studentName:  student.name,
      answer:       ans.trim(),
      submittedAt:  new Date().toISOString(),
    };
    const all = getHomeworkSubmissions();
    all.push(sub);
    saveHomeworkSubmissions(all);
    setSubs(all.filter(s => s.studentEmail === student.email));
    setAns(""); setOpen(null);
    toast("تم تسليم الواجب ✅", "success");
    setSubmitting(false);
  };

  const isOverdue = (h: Homework) => new Date(h.dueDate) < new Date();

  if (hw.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>📝</div>
        <p style={{ color: "var(--text-muted)" }}>لا توجد واجبات منزلية مُعيَّنة لك الآن</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {hw.map(h => {
        const sub     = getSubmission(h.id);
        const overdue = isOverdue(h);
        const isOpen  = open === h.id;
        const statusClr = sub ? "var(--success)" : overdue ? "var(--danger)" : "var(--warning)";
        const statusTxt = sub ? "سُلِّم ✅" : overdue ? "منتهي المهلة ❌" : "في الانتظار ⏳";

        return (
          <div key={h.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div
              onClick={() => !sub && setOpen(isOpen ? null : h.id)}
              style={{ padding: "16px 20px", cursor: sub ? "default" : "pointer", display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(108,99,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>📝</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{h.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: statusClr }}>{statusTxt}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{h.subjectName} · الأستاذ: {h.teacherName}</div>
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, marginBottom: 8 }}>{h.description}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)" }}>
                  <span>📅 التسليم: <strong style={{ color: overdue && !sub ? "var(--danger)" : "var(--text)" }}>{new Date(h.dueDate).toLocaleDateString("ar-SA")}</strong></span>
                  <span>💯 الدرجة القصوى: {h.maxPoints}</span>
                </div>
              </div>
              {!sub && !overdue && (
                <button onClick={e => { e.stopPropagation(); setOpen(isOpen ? null : h.id); }}
                  style={{ padding: "7px 16px", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", color: "var(--primary)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {isOpen ? "إلغاء ▲" : "تسليم ▼"}
                </button>
              )}
            </div>

            {/* Submitted answer */}
            {sub && (
              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--glass-border)", background: "rgba(34,197,94,0.05)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", marginBottom: 6 }}>✅ إجابتك المُسلَّمة ({new Date(sub.submittedAt).toLocaleDateString("ar-SA")})</div>
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{sub.answer}</div>
                {sub.grade !== undefined && (
                  <div style={{ marginTop: 10, padding: "8px 14px", background: "rgba(108,99,255,0.08)", borderRadius: "var(--radius-sm)" }}>
                    <strong>درجتك: {sub.grade}/{h.maxPoints}</strong>
                    {sub.feedback && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>💬 {sub.feedback}</div>}
                  </div>
                )}
              </div>
            )}

            {/* Submit form */}
            {isOpen && !sub && (
              <div style={{ padding: "14px 20px", borderTop: "1px solid var(--glass-border)", background: "rgba(108,99,255,0.03)" }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>✍️ إجابتك:</label>
                <textarea
                  value={ans} onChange={e => setAns(e.target.value)}
                  placeholder="اكتب إجابتك هنا..."
                  rows={4}
                  style={{ width: "100%", background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
                />
                <button onClick={() => submit(h)} disabled={submitting}
                  style={{ marginTop: 10, padding: "9px 24px", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>
                  📤 تسليم الواجب
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

