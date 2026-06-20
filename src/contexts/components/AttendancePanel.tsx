import { useState } from "react";
import type { Teacher, Subject } from "@/lib/db";
import { getStudents, getAttendance, saveAttendance } from "@/lib/db";
import type { AttendanceRecord } from "@/lib/db";
import { toast } from "./Toast";

interface Props { teacher: Teacher; mySubjects: Subject[]; card: React.CSSProperties; }

type Status = AttendanceRecord["status"];

const STATUS_LABELS: Record<Status, string> = {
  present: "حاضر ✅", absent: "غائب ❌", late: "متأخر ⏰", excused: "معذور 📄",
};
const STATUS_COLORS: Record<Status, string> = {
  present: "var(--success)", absent: "var(--danger)", late: "var(--warning)", excused: "var(--primary)",
};

export function AttendancePanel({ teacher, mySubjects, card }: Props) {
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDate, setSelectedDate]       = useState(new Date().toISOString().slice(0, 10));
  const [statuses, setStatuses]               = useState<Record<number, Status>>({});
  const [notes, setNotes]                     = useState<Record<number, string>>({});
  const [viewMode, setViewMode]               = useState<"mark" | "history">("mark");
  const [, forceRender]                       = useState(0);
  const refresh = () => forceRender(n => n + 1);

  const sub = mySubjects.find(s => s.id === selectedSubject);
  const eligibleStudents = sub
    ? getStudents().filter(st =>
        st.stage === sub.stage && st.grade === sub.grade &&
        (sub.track === "all" || st.track === sub.track) &&
        st.schoolId === teacher.schoolId)
    : [];

  const history = getAttendance()
    .filter(a => a.teacherId === teacher.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const handleSave = () => {
    if (!selectedSubject || !selectedDate) { toast("اختر المادة والتاريخ", "error"); return; }
    if (eligibleStudents.length === 0)     { toast("لا يوجد طلاب لهذه المادة", "error"); return; }
    const all = getAttendance().filter(a =>
      !(a.subjectId === selectedSubject && a.date === selectedDate && a.teacherId === teacher.id)
    );
    const newRecords: AttendanceRecord[] = eligibleStudents.map(st => ({
      id: `att_${Date.now()}_${st.id}`,
      date: selectedDate,
      subjectId: sub!.id,
      subjectName: sub!.name,
      teacherId: teacher.id,
      studentId: st.id,
      studentName: st.name,
      schoolId: teacher.schoolId,
      status: statuses[st.id] ?? "present",
      note: notes[st.id] ?? "",
    }));
    saveAttendance([...all, ...newRecords]);
    setStatuses({}); setNotes({});
    refresh();
    toast(`تم حفظ الحضور لـ ${newRecords.length} طالب ✅`, "success");
  };

  const summaryByDate = history.reduce<Record<string, { date: string; subject: string; total: number; present: number }>>((acc, r) => {
    const key = `${r.date}_${r.subjectId}`;
    if (!acc[key]) acc[key] = { date: r.date, subject: r.subjectName, total: 0, present: 0 };
    acc[key].total++;
    if (r.status === "present") acc[key].present++;
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["mark", "history"] as const).map(m => (
          <button key={m} onClick={() => setViewMode(m)}
            className={`btn ${viewMode === m ? "btn-primary" : ""}`}
            style={{ fontSize: 13, padding: "7px 18px", opacity: viewMode === m ? 1 : 0.6 }}>
            {m === "mark" ? "📝 تسجيل الحضور" : "📊 سجل الحضور"}
          </button>
        ))}
      </div>

      {viewMode === "mark" && (
        <div style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>📝 تسجيل الحضور والغياب</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            <div>
              <label className="form-label">المادة</label>
              <select className="form-input" value={selectedSubject}
                onChange={e => { setSelectedSubject(e.target.value); setStatuses({}); }}>
                <option value="">— اختر المادة —</option>
                {mySubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">التاريخ</label>
              <input className="form-input" type="date" value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)} />
            </div>
          </div>

          {!selectedSubject
            ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>اختر المادة لعرض الطلاب</p>
            : eligibleStudents.length === 0
            ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>لا يوجد طلاب مسجلون لهذه المادة</p>
            : (
              <>
                {/* Quick-set all */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>تعيين الكل:</span>
                  {(["present","absent","late","excused"] as Status[]).map(st => (
                    <button key={st} className="btn" style={{ fontSize: 12, padding: "4px 12px", background: STATUS_COLORS[st], color: "#fff" }}
                      onClick={() => setStatuses(Object.fromEntries(eligibleStudents.map(s => [s.id, st])))}>
                      {STATUS_LABELS[st]}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto" }}>
                  {eligibleStudents.map((st, i) => {
                    const cur = statuses[st.id] ?? "present";
                    return (
                      <div key={st.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, alignItems: "center", padding: "10px 12px", background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                        <span style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: 13 }}>{i + 1}</span>
                        <span style={{ fontWeight: 600 }}>{st.name}</span>
                        <select value={cur}
                          onChange={e => setStatuses(p => ({ ...p, [st.id]: e.target.value as Status }))}
                          style={{ padding: "4px 8px", borderRadius: 6, border: `2px solid ${STATUS_COLORS[cur]}`, fontSize: 13, background: "var(--bg-card)", color: STATUS_COLORS[cur], fontWeight: 700 }}>
                          {(["present","absent","late","excused"] as Status[]).map(s =>
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          )}
                        </select>
                        <input placeholder="ملاحظة" value={notes[st.id] ?? ""}
                          onChange={e => setNotes(p => ({ ...p, [st.id]: e.target.value }))}
                          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, width: 100, background: "var(--bg-card)", color: "var(--text)" }} />
                      </div>
                    );
                  })}
                </div>

                <button className="btn btn-primary" style={{ marginTop: 16, width: "100%" }} onClick={handleSave}>
                  💾 حفظ الحضور ({eligibleStudents.length} طالب)
                </button>
              </>
            )}
        </div>
      )}

      {viewMode === "history" && (
        <div style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>📊 سجل الحضور</h3>
          {Object.values(summaryByDate).length === 0
            ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>لا يوجد سجل حضور بعد</p>
            : Object.values(summaryByDate).slice(0, 20).map(row => {
              const pct = Math.round((row.present / row.total) * 100);
              return (
                <div key={`${row.date}_${row.subject}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{row.subject}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.date} · {row.total} طالب</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: pct >= 80 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)" }}>{pct}%</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>حضور</div>
                  </div>
                  <div style={{ width: 60, height: 8, background: "var(--border)", borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)", borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

