import { useState } from "react";
import type { Teacher, Subject, Student, TimetableSlot, Weekday } from "@/lib/db";
import { getTimetable, saveTimetable, getTimetableForStudent } from "@/lib/db";
import { toast } from "./Toast";

/* ─── Shared constants ──────────────────────────────────────────────────────── */
export const DAYS: { id: Weekday; label: string; short: string }[] = [
  { id: "sun", label: "الأحد",    short: "أحد" },
  { id: "mon", label: "الاثنين",  short: "اثنين" },
  { id: "tue", label: "الثلاثاء", short: "ثلاثاء" },
  { id: "wed", label: "الأربعاء", short: "أربعاء" },
  { id: "thu", label: "الخميس",   short: "خميس" },
];

const HOUR_SLOTS = Array.from({ length: 9 }, (_, i) => {
  const h = 7 + i;
  return `${String(h).padStart(2, "0")}:00`;
});

const COLORS = ["#6c63ff","#10b981","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];
const subjectColor = (subjectId: string) => {
  const safeId = subjectId || "";
  const hash = Math.abs(safeId.split("").reduce((a, c) => a + (c ? c.charCodeAt(0) : 0), 0));
  return COLORS[hash % COLORS.length];
};

/* ─── Teacher view ──────────────────────────────────────────────────────────── */
interface TeacherProps { role: "teacher"; teacher: Teacher; mySubjects: Subject[]; card: React.CSSProperties; }

const EMPTY_SLOT = { subjectId: "", day: "sun" as Weekday, startTime: "08:00", endTime: "09:00", room: "" };

function TeacherTimetable({ teacher, mySubjects, card }: TeacherProps) {
  const [form, setForm]   = useState(EMPTY_SLOT);
  const [showForm, setShowForm] = useState(false);
  const [, forceRender]   = useState(0);
  const refresh = () => forceRender(n => n + 1);

  const mySlots = getTimetable().filter(s => s.teacherId === teacher.id);

  const handleAdd = () => {
    if (!form.subjectId) { toast("اختر المادة", "error"); return; }
    if (form.startTime >= form.endTime) { toast("وقت البداية يجب أن يكون قبل النهاية", "error"); return; }
    const sub = mySubjects.find(s => s.id === form.subjectId)!;
    const slot: TimetableSlot = {
      id: `ts_${Date.now()}`,
      subjectId: sub.id,
      subjectName: sub.name,
      teacherId: teacher.id,
      teacherName: teacher.name,
      day: form.day,
      startTime: form.startTime,
      endTime: form.endTime,
      room: form.room,
      stage: sub.stage,
      grade: sub.grade,
      track: sub.track,
      schoolId: teacher.schoolId,
    };
    saveTimetable([...getTimetable(), slot]);
    setForm(EMPTY_SLOT);
    setShowForm(false);
    refresh();
    toast("تمت إضافة الحصة ✅", "success");
  };

  const handleDelete = (id: string) => {
    saveTimetable(getTimetable().filter(s => s.id !== id));
    refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <button className="btn btn-primary" style={{ alignSelf: "flex-start" }}
        onClick={() => setShowForm(p => !p)}>
        {showForm ? "✕ إلغاء" : "➕ إضافة حصة"}
      </button>

      {showForm && (
        <div style={{ ...card, border: "2px solid var(--primary)", background: "rgba(108,99,255,0.04)" }}>
          <h4 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>➕ إضافة حصة جديدة</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label">المادة</label>
              <select className="form-input" value={form.subjectId}
                onChange={e => setForm(p => ({ ...p, subjectId: e.target.value }))}>
                <option value="">— اختر —</option>
                {mySubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">اليوم</label>
              <select className="form-input" value={form.day}
                onChange={e => setForm(p => ({ ...p, day: e.target.value as Weekday }))}>
                {DAYS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">وقت البداية</label>
              <input className="form-input" type="time" value={form.startTime}
                onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">وقت الانتهاء</label>
              <input className="form-input" type="time" value={form.endTime}
                onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label className="form-label">القاعة / الغرفة (اختياري)</label>
              <input className="form-input" value={form.room}
                onChange={e => setForm(p => ({ ...p, room: e.target.value }))}
                placeholder="مثال: قاعة 201" />
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} onClick={handleAdd}>
            ➕ إضافة الحصة
          </button>
        </div>
      )}

      {/* Grid view */}
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>📅 جدولي الأسبوعي</h3>
        {mySlots.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
            لا توجد حصص بعد — أضف حصصك لتظهر لطلابك
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px 12px", background: "var(--bg)", fontSize: 13, fontWeight: 700, border: "1px solid var(--border)", minWidth: 60 }}>الوقت</th>
                  {DAYS.map(d => (
                    <th key={d.id} style={{ padding: "8px 12px", background: "var(--bg)", fontSize: 13, fontWeight: 700, border: "1px solid var(--border)", minWidth: 100 }}>{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOUR_SLOTS.map(hour => (
                  <tr key={hour}>
                    <td style={{ padding: "6px 10px", fontSize: 12, color: "var(--text-muted)", border: "1px solid var(--border)", textAlign: "center", fontWeight: 700 }}>{hour}</td>
                    {DAYS.map(d => {
                      const slot = mySlots.find(s => s.day === d.id && s.startTime <= hour && s.endTime > hour);
                      return (
                        <td key={d.id} style={{ padding: 4, border: "1px solid var(--border)", height: 48, verticalAlign: "middle" }}>
                          {slot && (
                            <div style={{
                              background: subjectColor(slot.subjectId) + "22",
                              border: `2px solid ${subjectColor(slot.subjectId)}`,
                              borderRadius: 6, padding: "4px 8px", fontSize: 12, fontWeight: 700,
                              color: subjectColor(slot.subjectId), position: "relative",
                            }}>
                              {slot.subjectName}
                              {slot.startTime === hour && (
                                <button onClick={() => handleDelete(slot.id)}
                                  style={{ position: "absolute", top: 2, left: 2, fontSize: 10, background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}>✕</button>
                              )}
                              {slot.room && <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{slot.room}</div>}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Student view ──────────────────────────────────────────────────────────── */
interface StudentProps { role: "student"; student: Student; card: React.CSSProperties; }

function StudentTimetable({ student, card }: StudentProps) {
  const slots = getTimetableForStudent(student);
  const today = ["sun","mon","tue","wed","thu","fri","sat"][new Date().getDay()] as Weekday;
  const todaySlots = slots.filter(s => s.day === today).sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (slots.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-muted)" }}>لا يوجد جدول حصص بعد</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>سيُضيف أساتذتك حصصهم قريباً</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Today's schedule */}
      {todaySlots.length > 0 && (
        <div style={{ ...card, background: "linear-gradient(135deg,rgba(108,99,255,0.08),rgba(168,85,247,0.04))", border: "2px solid var(--primary)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>
            📆 حصص اليوم — {DAYS.find(d => d.id === today)?.label}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {todaySlots.map(s => (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                background: "var(--bg)", borderRadius: "var(--radius-sm)",
                borderRight: `4px solid ${subjectColor(s.subjectId)}`,
              }}>
                <div style={{ textAlign: "center", minWidth: 60 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)" }}>{s.startTime}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.endTime}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: subjectColor(s.subjectId) }}>{s.subjectName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.teacherName}{s.room && ` · ${s.room}`}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full weekly grid */}
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>📅 الجدول الأسبوعي الكامل</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "8px 12px", background: "var(--bg)", fontSize: 13, border: "1px solid var(--border)" }}>الوقت</th>
                {DAYS.map(d => (
                  <th key={d.id} style={{
                    padding: "8px 12px", fontSize: 13, fontWeight: 700, border: "1px solid var(--border)",
                    background: d.id === today ? "rgba(108,99,255,0.1)" : "var(--bg)",
                    color: d.id === today ? "var(--primary)" : "var(--text)",
                    minWidth: 100,
                  }}>
                    {d.label} {d.id === today && "⬅"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOUR_SLOTS.map(hour => (
                <tr key={hour}>
                  <td style={{ padding: "6px 10px", fontSize: 12, color: "var(--text-muted)", border: "1px solid var(--border)", textAlign: "center", fontWeight: 700 }}>{hour}</td>
                  {DAYS.map(d => {
                    const slot = slots.find(s => s.day === d.id && s.startTime <= hour && s.endTime > hour);
                    return (
                      <td key={d.id} style={{ padding: 4, border: "1px solid var(--border)", height: 48, background: d.id === today ? "rgba(108,99,255,0.03)" : "transparent" }}>
                        {slot && (
                          <div style={{
                            background: subjectColor(slot.subjectId) + "22",
                            border: `2px solid ${subjectColor(slot.subjectId)}`,
                            borderRadius: 6, padding: "4px 8px", fontSize: 12, fontWeight: 700,
                            color: subjectColor(slot.subjectId),
                          }}>
                            {slot.subjectName}
                            {slot.room && <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{slot.room}</div>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Export both as one component ─────────────────────────────────────────── */
type Props = TeacherProps | StudentProps;

export function TimetablePanel(props: Props) {
  if (props.role === "teacher") return <TeacherTimetable {...props} />;
  return <StudentTimetable {...props} />;
}

