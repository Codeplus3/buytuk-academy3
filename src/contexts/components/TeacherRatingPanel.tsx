import { useState, useMemo } from "react";
import type { Student, Teacher } from "@/lib/db";
import {
  getTeachers, getSubjectsForStudent,
  getTeacherRatings, saveTeacherRatings,
  getRatingsForTeacher,
} from "@/lib/db";
import type { TeacherRating } from "@/lib/db";
import { toast } from "./Toast";
import { avatarUrl } from "@/lib/auth";

/* ─── Student: rate a teacher ───────────────────────────────────────────────── */
interface StudentProps { role: "student"; student: Student; card: React.CSSProperties; }

const CATEGORIES: { id: TeacherRating["category"]; label: string; icon: string }[] = [
  { id: "explanation",  label: "أسلوب الشرح",   icon: "🗣" },
  { id: "interaction",  label: "التفاعل مع الطلاب", icon: "🤝" },
  { id: "fairness",     label: "العدالة والموضوعية", icon: "⚖️" },
  { id: "overall",      label: "التقييم العام",   icon: "⭐" },
];

const STARS = [1, 2, 3, 4, 5] as const;

function StudentRatingView({ student, card }: StudentProps) {
  const mySubjects   = getSubjectsForStudent(student);
  const teacherIds   = [...new Set(mySubjects.flatMap(s => s.teacherIds ?? []).filter(Boolean) as number[])];
  const myTeachers   = getTeachers().filter(t => teacherIds.includes(t.id));
  const allRatings   = getTeacherRatings();
  const myRatings    = allRatings.filter(r => r.studentId === student.id);

  const [selected, setSelected]   = useState<Teacher | null>(null);
  const [category, setCategory]   = useState<TeacherRating["category"]>("overall");
  const [rating, setRating]       = useState<1|2|3|4|5>(4);
  const [comment, setComment]     = useState("");

  const alreadyRated = (teacherId: number, cat: TeacherRating["category"]) =>
    myRatings.some(r => r.teacherId === teacherId && r.category === cat);

  const handleSubmit = () => {
    if (!selected) return;
    if (alreadyRated(selected.id, category)) {
      toast("قيّمت هذا الأستاذ في هذه الفئة بالفعل", "error"); return;
    }
    const all = getTeacherRatings();
    const r: TeacherRating = {
      id:        `tr_${Date.now()}`,
      teacherId: selected.id,
      studentId: student.id,
      rating,
      comment:   comment.trim(),
      category,
      createdAt: new Date().toISOString(),
    };
    saveTeacherRatings([...all, r]);
    setComment("");
    toast("شكراً على تقييمك! 🙏", "success");
  };

  const avgFor = (teacherId: number) => {
    const rs = allRatings.filter(r => r.teacherId === teacherId);
    if (!rs.length) return null;
    return (rs.reduce((a, r) => a + r.rating, 0) / rs.length).toFixed(1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Teacher list */}
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>👨‍🏫 قيّم أساتذتك</h3>
        {myTeachers.length === 0
          ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>لا يوجد أساتذة مرتبطون بمواد دراستك</p>
          : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
              {myTeachers.map(t => {
                const avg  = avgFor(t.id);
                const done = CATEGORIES.every(c => alreadyRated(t.id, c.id));
                return (
                  <button key={t.id} onClick={() => setSelected(t)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                      background: selected?.id === t.id ? "rgba(108,99,255,0.1)" : "var(--bg)",
                      border: `2px solid ${selected?.id === t.id ? "var(--primary)" : "var(--border)"}`,
                      borderRadius: "var(--radius-sm)", cursor: "pointer", textAlign: "right",
                    }}>
                    <img src={avatarUrl(t.name)} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.spec}</div>
                      {avg && <div style={{ fontSize: 12, color: "var(--warning)", fontWeight: 700 }}>⭐ {avg}</div>}
                    </div>
                    {done && <span className="badge badge-success" style={{ fontSize: 10 }}>✅ مكتمل</span>}
                  </button>
                );
              })}
            </div>
          )}
      </div>

      {/* Rating form */}
      {selected && (
        <div style={{ ...card, border: "2px solid var(--primary)", background: "rgba(108,99,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <img src={avatarUrl(selected.name)} alt="" style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid var(--primary)" }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{selected.name}</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{selected.spec}</div>
            </div>
          </div>

          {/* Category tabs */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {CATEGORIES.map(c => {
              const done = alreadyRated(selected.id, c.id);
              return (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  className={`btn ${category === c.id ? "btn-primary" : ""}`}
                  style={{ fontSize: 12, padding: "6px 12px", opacity: done ? 0.55 : 1, position: "relative" }}>
                  {c.icon} {c.label}
                  {done && <span style={{ marginRight: 4, color: "var(--success)" }}>✅</span>}
                </button>
              );
            })}
          </div>

          {alreadyRated(selected.id, category) ? (
            <div style={{ padding: "14px 18px", background: "rgba(16,185,129,0.08)", borderRadius: 10, border: "1px solid var(--success)", fontSize: 14, color: "var(--success)" }}>
              ✅ قيّمت هذا الأستاذ في فئة «{CATEGORIES.find(c => c.id === category)?.label}» بالفعل
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">تقييمك لـ «{CATEGORIES.find(c => c.id === category)?.label}»</label>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {STARS.map(s => (
                    <button key={s} onClick={() => setRating(s)}
                      style={{ fontSize: 32, background: "none", border: "none", cursor: "pointer", opacity: s <= rating ? 1 : 0.25, transition: "opacity 0.15s, transform 0.15s", transform: s <= rating ? "scale(1.1)" : "scale(1)" }}>
                      ⭐
                    </button>
                  ))}
                  <span style={{ alignSelf: "center", fontWeight: 900, fontSize: 18, color: "var(--warning)" }}>{rating}/5</span>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">تعليق (اختياري — مجهول)</label>
                <textarea className="form-input" rows={3} value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="شاركنا رأيك بصدق — تعليقك سيكون مجهولاً للأستاذ" />
              </div>
              <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleSubmit}>
                إرسال التقييم 🙏
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Teacher: view received ratings ────────────────────────────────────────── */
interface TeacherProps { role: "teacher"; teacher: Teacher; card: React.CSSProperties; }

function TeacherRatingsView({ teacher, card }: TeacherProps) {
  const ratings = useMemo(() => getRatingsForTeacher(teacher.id), [teacher.id]);

  const avgByCat = useMemo(() =>
    CATEGORIES.map(c => {
      const rs = ratings.filter(r => r.category === c.id);
      const avg = rs.length ? (rs.reduce((a, r) => a + r.rating, 0) / rs.length) : null;
      return { ...c, avg, count: rs.length };
    }),
    [ratings],
  );

  const overall = ratings.length
    ? (ratings.reduce((a, r) => a + r.rating, 0) / ratings.length).toFixed(1)
    : null;

  if (ratings.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⭐</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-muted)" }}>لا توجد تقييمات بعد</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>ستظهر تقييمات طلابك هنا بشكل مجهول</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Overall */}
      <div style={{ ...card, textAlign: "center", background: "linear-gradient(135deg,rgba(245,158,11,0.1),rgba(245,158,11,0.04))", border: "2px solid rgba(245,158,11,0.4)" }}>
        <div style={{ fontSize: 56, marginBottom: 4 }}>⭐</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: "var(--warning)" }}>{overall}</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>متوسط تقييمك الإجمالي من {ratings.length} تقييم</div>
      </div>

      {/* By category */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {avgByCat.map(c => (
          <div key={c.id} style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{c.label}</div>
            {c.avg !== null ? (
              <>
                <div style={{ fontWeight: 900, fontSize: 28, color: "var(--warning)" }}>
                  {"⭐".repeat(Math.round(c.avg))}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--warning)", marginTop: 4 }}>{c.avg.toFixed(1)}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.count} تقييم</div>
              </>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>لا تقييمات بعد</div>
            )}
          </div>
        ))}
      </div>

      {/* Comments */}
      <div style={card}>
        <h4 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>💬 تعليقات الطلاب (مجهولة)</h4>
        {ratings.filter(r => r.comment).length === 0
          ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>لا توجد تعليقات بعد</p>
          : ratings.filter(r => r.comment).slice(0, 20).map(r => (
            <div key={r.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span className="badge badge-info" style={{ fontSize: 11 }}>
                  {CATEGORIES.find(c => c.id === r.category)?.icon} {CATEGORIES.find(c => c.id === r.category)?.label}
                </span>
                <span style={{ color: "var(--warning)", fontWeight: 700 }}>{"⭐".repeat(r.rating)} {r.rating}/5</span>
              </div>
              <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>{r.comment}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                {new Date(r.createdAt).toLocaleDateString("ar-EG")}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ─── Export ────────────────────────────────────────────────────────────────── */
type Props = StudentProps | TeacherProps;
export function TeacherRatingPanel(props: Props) {
  if (props.role === "student") return <StudentRatingView {...props} />;
  return <TeacherRatingsView {...props} />;
}

