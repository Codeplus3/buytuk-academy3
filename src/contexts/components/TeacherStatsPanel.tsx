import { useMemo } from "react";
import { getExamRecords, getQuestions } from "@/lib/db";
import type { Teacher, Subject, Exam } from "@/lib/db";

interface Props { teacher: Teacher; mySubjects: Subject[]; myExams: Exam[]; card: React.CSSProperties; }

export function TeacherStatsPanel({ teacher, mySubjects, myExams, card }: Props) {
  const allRecords = useMemo(() => getExamRecords(), []);
  const allQuestions = useMemo(() => getQuestions(), []);

  const myExamIds  = new Set(myExams.map(e => e.id));
  const myRecords  = allRecords.filter(r => r.examId && myExamIds.has(r.examId));
  const myQCount   = allQuestions.filter(q => q.subjectId && mySubjects.some(s => s.id === q.subjectId)).length;

  const uniqueStudents = new Set(myRecords.map(r => r.studentEmail)).size;
  const avgScore       = myRecords.length > 0 ? Math.round(myRecords.reduce((s, r) => s + r.percentage, 0) / myRecords.length) : 0;
  const passRate       = myRecords.length > 0 ? Math.round((myRecords.filter(r => r.percentage >= 60).length / myRecords.length) * 100) : 0;

  // Per-exam stats
  const examStats = myExams.map(ex => {
    const recs  = myRecords.filter(r => r.examId === ex.id);
    const avg   = recs.length > 0 ? Math.round(recs.reduce((s, r) => s + r.percentage, 0) / recs.length) : null;
    const pass  = recs.length > 0 ? Math.round((recs.filter(r => r.percentage >= 60).length / recs.length) * 100) : null;
    return { ex, count: recs.length, avg, pass };
  }).sort((a, b) => b.count - a.count);

  // Per-subject stats
  const subjectStats = mySubjects.map(s => {
    const sExamIds = new Set(myExams.filter(e => e.subjectId === s.id).map(e => e.id));
    const recs     = myRecords.filter(r => r.examId && sExamIds.has(r.examId));
    const avg      = recs.length > 0 ? Math.round(recs.reduce((sum, r) => sum + r.percentage, 0) / recs.length) : null;
    const qCount   = allQuestions.filter(q => q.subjectId === s.id).length;
    return { s, examCount: myExams.filter(e => e.subjectId === s.id).length, attempts: recs.length, avg, qCount };
  });

  // Hardest questions (most wrong answers)
  const wrongMap = new Map<string, { text: string; wrong: number }>();
  for (const r of myRecords) {
    // We can't easily track per-question wrong from ExamRecord alone — show per-exam difficulty
  }
  void wrongMap;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {[
          [
            { icon: "📝", label: "اختباراتي",          value: myExams.length,     color: "var(--primary)" },
            { icon: "👥", label: "طلاب أجروا اختباراتي", value: uniqueStudents,     color: "var(--info)" },
          ],
          [
            { icon: "📊", label: "متوسط الدرجات",       value: myRecords.length > 0 ? `${avgScore}%` : "—", color: "var(--warning)" },
            { icon: "✅", label: "معدل النجاح",          value: myRecords.length > 0 ? `${passRate}%` : "—", color: "var(--success)" },
          ],
        ].map((row, ri) => (
          <div key={ri} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {row.map(s => (
              <div key={s.label} style={{ ...card, textAlign: "center", padding: 16 }}>
                <div style={{ fontSize: 26, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Extra stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {[
          { icon: "🔢", label: "إجمالي المحاولات",    value: myRecords.length,    color: "var(--secondary)" },
          { icon: "❓", label: "أسئلتي في البنك",     value: myQCount,            color: "var(--primary)" },
          { icon: "📚", label: "موادّي المعيّنة",      value: mySubjects.length,   color: "var(--info)" },
        ].map(s => (
          <div key={s.label} style={{ ...card, textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Per-subject breakdown */}
      {mySubjects.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--glass-border)", fontWeight: 700, fontSize: 14 }}>📚 إحصاءات حسب المادة</div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>المادة</th><th>الاختبارات</th><th>المحاولات</th><th>متوسط الدرجات</th><th>الأسئلة في البنك</th></tr></thead>
              <tbody>
                {subjectStats.map(({ s, examCount, attempts, avg, qCount }) => (
                  <tr key={s.id}>
                    <td><span style={{ fontSize: 18, marginInlineEnd: 8 }}>{s.icon}</span><strong>{s.name}</strong></td>
                    <td>{examCount}</td>
                    <td>{attempts}</td>
                    <td>{avg !== null ? <span className={`badge ${avg >= 60 ? "badge-success" : "badge-danger"}`}>{avg}%</span> : "—"}</td>
                    <td>{qCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-exam breakdown */}
      {examStats.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--glass-border)", fontWeight: 700, fontSize: 14 }}>📝 أداء الطلاب في اختباراتي</div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>الاختبار</th><th>المحاولات</th><th>متوسط الدرجات</th><th>معدل النجاح</th></tr></thead>
              <tbody>
                {examStats.map(({ ex, count, avg, pass }) => (
                  <tr key={ex.id}>
                    <td style={{ fontWeight: 600 }}>{ex.title}</td>
                    <td>{count}</td>
                    <td>{avg !== null ? <span className={`badge ${avg >= 60 ? "badge-success" : "badge-danger"}`}>{avg}%</span> : "—"}</td>
                    <td>{pass !== null ? <span className={`badge ${pass >= 60 ? "badge-success" : "badge-danger"}`}>{pass}%</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {myExams.length === 0 && mySubjects.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: 50 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>📈</div>
          <p style={{ color: "var(--text-muted)" }}>أنشئ اختبارات لترى الإحصاءات هنا</p>
        </div>
      )}
    </div>
  );
}

