import { useMemo } from "react";
import type { Student } from "@/lib/db";
import { getAttendanceForStudent } from "@/lib/db";
import type { AttendanceRecord } from "@/lib/db";

interface Props { student: Student; card: React.CSSProperties; }

type Status = AttendanceRecord["status"];

const STATUS_LABELS: Record<Status, string> = {
  present: "حاضر", absent: "غائب", late: "متأخر", excused: "معذور",
};
const STATUS_COLORS: Record<Status, string> = {
  present: "var(--success)", absent: "var(--danger)", late: "var(--warning)", excused: "var(--primary)",
};
const STATUS_ICONS: Record<Status, string> = {
  present: "✅", absent: "❌", late: "⏰", excused: "📄",
};

export function StudentAttendanceView({ student, card }: Props) {
  const records = useMemo(() =>
    getAttendanceForStudent(student.id).sort((a, b) => b.date.localeCompare(a.date)),
    [student.id]
  );

  const stats = useMemo(() => {
    const total   = records.length;
    const present = records.filter(r => r.status === "present").length;
    const absent  = records.filter(r => r.status === "absent").length;
    const late    = records.filter(r => r.status === "late").length;
    const excused = records.filter(r => r.status === "excused").length;
    const pct     = total > 0 ? Math.round(((present + excused) / total) * 100) : 0;
    return { total, present, absent, late, excused, pct };
  }, [records]);

  const bySubject = useMemo(() => {
    return records.reduce<Record<string, { name: string; total: number; present: number }>>((acc, r) => {
      if (!acc[r.subjectId]) acc[r.subjectId] = { name: r.subjectName, total: 0, present: 0 };
      acc[r.subjectId].total++;
      if (r.status === "present" || r.status === "excused") acc[r.subjectId].present++;
      return acc;
    }, {});
  }, [records]);

  if (records.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-muted)" }}>لا يوجد سجل حضور بعد</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>سيظهر هنا سجل حضورك وغيابك تلقائياً</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Overall stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {[
          { label: "حاضر",  value: stats.present,  color: STATUS_COLORS.present, icon: "✅" },
          { label: "غائب",  value: stats.absent,   color: STATUS_COLORS.absent,  icon: "❌" },
          { label: "متأخر", value: stats.late,     color: STATUS_COLORS.late,    icon: "⏰" },
          { label: "معذور", value: stats.excused,  color: STATUS_COLORS.excused, icon: "📄" },
        ].map(s => (
          <div key={s.label} style={{ ...card, textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Attendance rate */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontWeight: 700 }}>نسبة الحضور الإجمالية</span>
          <span style={{ fontWeight: 900, fontSize: 22, color: stats.pct >= 80 ? "var(--success)" : stats.pct >= 60 ? "var(--warning)" : "var(--danger)" }}>
            {stats.pct}%
          </span>
        </div>
        <div style={{ height: 12, background: "var(--border)", borderRadius: 99 }}>
          <div style={{ height: "100%", width: `${stats.pct}%`, borderRadius: 99, background: stats.pct >= 80 ? "var(--success)" : stats.pct >= 60 ? "var(--warning)" : "var(--danger)", transition: "width 0.8s ease" }} />
        </div>
        {stats.pct < 75 && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8, fontSize: 13, color: "var(--danger)" }}>
            ⚠️ نسبة حضورك أقل من 75% — يرجى الانتباه
          </div>
        )}
      </div>

      {/* By subject */}
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>📚 الحضور حسب المادة</h3>
        {Object.values(bySubject).map(s => {
          const pct = Math.round((s.present / s.total) * 100);
          return (
            <div key={s.name} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                <span style={{ fontWeight: 700, color: pct >= 80 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)" }}>{pct}%</span>
              </div>
              <div style={{ height: 8, background: "var(--border)", borderRadius: 99 }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: pct >= 80 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed log */}
      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>📋 السجل التفصيلي</h3>
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {records.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: STATUS_COLORS[r.status], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                {STATUS_ICONS[r.status]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.subjectName}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.date} {r.note && `· ${r.note}`}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLORS[r.status] }}>{STATUS_LABELS[r.status]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

