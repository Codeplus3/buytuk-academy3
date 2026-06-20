import { useState } from "react";
import type { Exam, Subject } from "@/lib/db";

interface Props { exams: Exam[]; subjects: Subject[]; card: React.CSSProperties; }

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DAYS_AR   = ["أحد","اثن","ثلا","أرب","خمس","جمع","سبت"];

export function ExamCalendar({ exams, subjects, card }: Props) {
  const today  = new Date();
  const [cur, setCur] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const prev = () => setCur(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 });
  const next = () => setCur(c => c.m === 11 ? { y: c.y + 1, m: 0 }  : { y: c.y, m: c.m + 1 });

  const firstDay = new Date(cur.y, cur.m, 1).getDay();
  const daysIn   = new Date(cur.y, cur.m + 1, 0).getDate();

  const examsByDay = new Map<number, Exam[]>();
  for (const ex of exams) {
    const d = new Date(ex.createdAt);
    if (d.getFullYear() === cur.y && d.getMonth() === cur.m) {
      const day = d.getDate();
      if (!examsByDay.has(day)) examsByDay.set(day, []);
      examsByDay.get(day)!.push(ex);
    }
  }

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const [selected, setSelected] = useState<number | null>(null);
  const selExams = selected ? (examsByDay.get(selected) ?? []) : [];

  const subMap = Object.fromEntries(subjects.map(s => [s.id, s]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={card}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <button onClick={prev} style={{ background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", color: "var(--primary)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>◄</button>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{MONTHS_AR[cur.m]} {cur.y}</div>
          <button onClick={next} style={{ background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", color: "var(--primary)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>►</button>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 8 }}>
          {DAYS_AR.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", fontWeight: 700, padding: "4px 0" }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {cells.map((day, i) => {
            const isToday = day === today.getDate() && cur.m === today.getMonth() && cur.y === today.getFullYear();
            const hasExam = day !== null && examsByDay.has(day);
            const isSel   = day === selected;
            return (
              <div key={i} onClick={() => day && setSelected(isSel ? null : day)}
                style={{
                  minHeight: 42, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: day ? 600 : 400,
                  background: isSel ? "var(--primary)" : isToday ? "rgba(108,99,255,0.15)" : hasExam ? "rgba(34,197,94,0.1)" : "transparent",
                  border: isSel ? "1px solid var(--primary)" : isToday ? "1px solid var(--primary)" : hasExam ? "1px solid rgba(34,197,94,0.4)" : "1px solid transparent",
                  color: isSel ? "#fff" : isToday ? "var(--primary)" : "var(--text)",
                  cursor: day ? "pointer" : "default",
                  opacity: day ? 1 : 0,
                  transition: "all 0.15s",
                }}>
                {day && <>
                  <span>{day}</span>
                  {hasExam && <span style={{ fontSize: 8, color: isSel ? "#fff" : "var(--success)", marginTop: 2 }}>● {examsByDay.get(day)!.length} اختبار</span>}
                </>}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(34,197,94,0.3)", display: "inline-block" }} /> يوم اختبار</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(108,99,255,0.2)", display: "inline-block" }} /> اليوم</span>
        </div>
      </div>

      {/* Selected day exams */}
      {selected && (
        <div style={card}>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
            📝 اختبارات يوم {selected} {MONTHS_AR[cur.m]}
          </h4>
          {selExams.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>لا توجد اختبارات في هذا اليوم</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {selExams.map(ex => {
                const subj = subMap[ex.subjectId];
                return (
                  <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-sm)" }}>
                    <span style={{ fontSize: 28 }}>{subj?.icon ?? "📝"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{ex.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{subj?.name ?? "—"} · {ex.durationMinutes} دقيقة · النجاح {ex.passingPct}%</div>
                    </div>
                    <span className={`badge ${ex.status === "published" ? "badge-success" : "badge-warning"}`}>
                      {ex.status === "published" ? "متاح" : "مسودة"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Upcoming exams list */}
      <div style={card}>
        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📋 جميع الاختبارات المتاحة ({exams.length})</h4>
        {exams.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>لا توجد اختبارات منشورة بعد</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {exams.map(ex => {
              const subj = subMap[ex.subjectId];
              return (
                <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)" }}>
                  <span style={{ fontSize: 22 }}>{subj?.icon ?? "📝"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{ex.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{subj?.name ?? "—"} · {ex.durationMinutes} دق · نجاح {ex.passingPct}%</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(ex.createdAt).toLocaleDateString("ar-SA")}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

