import { useState, useEffect } from "react";
import type { Student, LiveSession } from "@/lib/db";
import { getLiveSessionsForStudent } from "@/lib/db";

interface Props { student: Student; card: React.CSSProperties; }

const PLATFORM_ICONS: Record<LiveSession["platform"], string> = {
  zoom: "🎥", meet: "🟢", teams: "🟣", other: "🔗",
};

export function LiveSessionViewer({ student, card }: Props) {
  const [sessions, setSessions] = useState<LiveSession[]>([]);

  const load = () => {
    const all = getLiveSessionsForStudent(student);
    setSessions(all.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
  };

  useEffect(() => {
    load();
    window.addEventListener("buytuk:sessions-changed", load);
    return () => window.removeEventListener("buytuk:sessions-changed", load);
  }, []);

  const now = new Date();
  const live     = sessions.filter(s => s.status === "live");
  const upcoming = sessions.filter(s => s.status === "upcoming" && new Date(s.scheduledAt) > now);
  const past     = sessions.filter(s => s.status === "ended").slice(0, 5);

  const SessionCard = ({ s, highlight }: { s: LiveSession; highlight?: boolean }) => (
    <div style={{
      border: `2px solid ${highlight ? "var(--danger)" : "var(--border)"}`,
      borderRadius: "var(--radius-sm)", padding: 16, marginBottom: 12,
      background: highlight ? "rgba(239,68,68,0.04)" : "var(--bg)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {highlight && <span style={{ color: "var(--danger)", marginLeft: 6 }}>🔴</span>}
            {s.title}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {PLATFORM_ICONS[s.platform]} {s.subjectName} · {s.teacherName}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            🕐 {new Date(s.scheduledAt).toLocaleString("ar-EG")} · {s.durationMin} دقيقة
          </div>
        </div>
        {highlight
          ? <span className="badge badge-danger" style={{ animation: "pulse 1.5s infinite" }}>مباشر الآن</span>
          : <span className="badge badge-info">قادم</span>}
      </div>
      {(s.status === "live" || s.status === "upcoming") && (
        <a href={s.meetingUrl} target="_blank" rel="noopener noreferrer"
          className="btn btn-primary"
          style={{ marginTop: 12, fontSize: 13, padding: "7px 18px", display: "inline-block" }}>
          {highlight ? "🔴 انضم الآن" : "🔗 فتح الرابط"}
        </a>
      )}
    </div>
  );

  if (sessions.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-muted)" }}>لا توجد جلسات مجدولة</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>سيُبلَّغك أستاذك عند إنشاء جلسة جديدة</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {live.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, color: "var(--danger)" }}>🔴 جلسات مباشرة الآن</h3>
          {live.map(s => <SessionCard key={s.id} s={s} highlight />)}
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>📅 الجلسات القادمة</h3>
          {upcoming.map(s => <SessionCard key={s.id} s={s} />)}
        </div>
      )}

      {past.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, color: "var(--text-muted)" }}>📁 الجلسات السابقة</h3>
          {past.map(s => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)", opacity: 0.7 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.subjectName} · {new Date(s.scheduledAt).toLocaleDateString("ar-EG")}</div>
              </div>
              <span className="badge" style={{ background: "var(--border)", color: "var(--text-muted)" }}>✅ انتهى</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

