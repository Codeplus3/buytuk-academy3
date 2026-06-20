import { useMemo } from "react";
import type { Student } from "@/lib/db";
import { getStudents, getExamRecords, computeStudentPoints, computeStudentBadges } from "@/lib/db";
import { avatarUrl } from "@/lib/auth";

interface Props { student: Student; card: React.CSSProperties; }

const MEDAL = ["🥇", "🥈", "🥉"];
const LEVEL_LABELS = ["مبتدئ", "متعلم", "متقدم", "متميز", "أكاديمي", "خبير"];
const LEVEL_COLORS = ["#6b7280", "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"];

export function Leaderboard({ student, card }: Props) {
  const allRecords = useMemo(() => getExamRecords(), []);

  const ranked = useMemo(() => {
    const students = getStudents().filter(
      s => s.schoolId === student.schoolId &&
           s.stage    === student.stage &&
           s.grade    === student.grade,
    );
    return students
      .map(s => {
        const recs   = allRecords.filter(r => r.studentEmail === s.email);
        const points = computeStudentPoints(recs);
        const badges = computeStudentBadges(recs);
        const avg    = recs.length ? Math.round(recs.reduce((a, r) => a + r.percentage, 0) / recs.length) : 0;
        const level  = Math.min(Math.floor(points / 100), LEVEL_LABELS.length - 1);
        return { ...s, points, badges, avg, attempts: recs.length, level };
      })
      .sort((a, b) => b.points - a.points || b.avg - a.avg);
  }, [allRecords, student]);

  const myRank = ranked.findIndex(s => s.id === student.id) + 1;
  const myEntry = ranked.find(s => s.id === student.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* My position banner */}
      {myEntry && (
        <div style={{
          ...card,
          background: "linear-gradient(135deg, rgba(108,99,255,0.15), rgba(168,85,247,0.08))",
          border: "2px solid var(--primary)",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{ fontSize: 40, fontWeight: 900, color: "var(--primary)", minWidth: 56, textAlign: "center" }}>
            {myRank <= 3 ? MEDAL[myRank - 1] : `#${myRank}`}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>مرتبتي في الصف</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
              من أصل {ranked.length} طالب · {myEntry.points} نقطة · {myEntry.badges.length} شارة
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: LEVEL_COLORS[myEntry.level] }}>
              ●  {LEVEL_LABELS[myEntry.level]}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--warning)" }}>⭐ {myEntry.points}</div>
          </div>
        </div>
      )}

      {/* Full ranking */}
      <div style={card}>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>
          🏆 لوحة المتصدرين — الصف {student.grade}
        </h3>

        {ranked.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📊</div>
            <div>لا توجد بيانات بعد — أكمل اختباراتك لتظهر في القائمة!</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ranked.map((s, i) => {
              const isMe = s.id === student.id;
              return (
                <div key={s.id} style={{
                  display: "grid",
                  gridTemplateColumns: "44px 36px 1fr auto auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: isMe
                    ? "rgba(108,99,255,0.1)"
                    : i < 3 ? "rgba(245,158,11,0.05)" : "var(--bg)",
                  border: isMe ? "2px solid var(--primary)" : "1px solid var(--border)",
                  transition: "transform 0.15s",
                }}>
                  {/* Rank */}
                  <div style={{
                    fontWeight: 900,
                    fontSize: i < 3 ? 22 : 15,
                    textAlign: "center",
                    color: i < 3 ? "var(--warning)" : "var(--text-muted)",
                  }}>
                    {i < 3 ? MEDAL[i] : `#${i + 1}`}
                  </div>

                  {/* Avatar */}
                  <img src={avatarUrl(s.name)} alt=""
                    style={{ width: 32, height: 32, borderRadius: "50%", border: isMe ? "2px solid var(--primary)" : "none" }} />

                  {/* Name + level */}
                  <div>
                    <div style={{ fontWeight: isMe ? 800 : 600, fontSize: 14 }}>
                      {s.name} {isMe && <span style={{ fontSize: 11, color: "var(--primary)" }}>(أنت)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: LEVEL_COLORS[s.level], fontWeight: 700 }}>
                      ● {LEVEL_LABELS[s.level]}
                    </div>
                  </div>

                  {/* Badges */}
                  <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>🏅 {s.badges.length}</div>
                    <div>شارة</div>
                  </div>

                  {/* Points */}
                  <div style={{ textAlign: "center", minWidth: 60 }}>
                    <div style={{ fontWeight: 900, fontSize: 16, color: "var(--warning)" }}>⭐ {s.points}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>نقطة</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How points are earned */}
      <div style={{ ...card, background: "rgba(108,99,255,0.04)" }}>
        <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>💡 كيف تكسب النقاط؟</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { icon: "✅", label: "كل اختبار تُكمله",   pts: "+10 نقطة" },
            { icon: "⭐", label: "فوق 60% في اختبار",  pts: "+20 نقطة" },
            { icon: "🔥", label: "فوق 80% في اختبار",  pts: "+30 نقطة" },
            { icon: "💯", label: "100% في اختبار",     pts: "+50 نقطة" },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--bg)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <span style={{ fontSize: 18 }}>{r.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{r.label}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "var(--warning)" }}>{r.pts}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

