import { useMemo } from "react";
import { computeStudentPoints, computeStudentBadges } from "@/lib/db";
import type { ExamRecord, Badge } from "@/lib/db";

interface Props { records: ExamRecord[]; card: React.CSSProperties; }

const ALL_BADGE_IDS = ["first_exam", "first_pass", "perfect", "five_exams", "ten_exams", "high_avg", "comeback", "consistent"];
const ALL_BADGE_META: Record<string, { name: string; icon: string; description: string }> = {
  first_exam:  { name: "أول خطوة",      icon: "🎯", description: "أكمل اختبارك الأول" },
  first_pass:  { name: "النجاح الأول",   icon: "🌟", description: "اجتز اختباراً بنجاح" },
  perfect:     { name: "درجة كاملة",     icon: "💯", description: "احصل على 100%" },
  five_exams:  { name: "طالب متميز",     icon: "🏆", description: "أكمل 5 اختبارات" },
  ten_exams:   { name: "خبير أكاديمي",   icon: "🎓", description: "أكمل 10 اختبارات" },
  high_avg:    { name: "متفوق",           icon: "📈", description: "حافظ على متوسط 80%+" },
  comeback:    { name: "العودة القوية",   icon: "🔥", description: "انتقل من رسوب إلى نجاح" },
  consistent:  { name: "منتظم",           icon: "⚡", description: "انجح في 3 اختبارات متتالية" },
};

const LEVELS = [
  { name: "مبتدئ",     min: 0,    max: 99,   color: "#94a3b8", icon: "🌱" },
  { name: "متعلم",     min: 100,  max: 299,  color: "#22c55e", icon: "📗" },
  { name: "متقدم",     min: 300,  max: 599,  color: "#3b82f6", icon: "💎" },
  { name: "متميز",     min: 600,  max: 999,  color: "#a855f7", icon: "🔮" },
  { name: "أكاديمي",   min: 1000, max: 99999, color: "#f59e0b", icon: "👑" },
];

export function GamificationPanel({ records, card }: Props) {
  const points = useMemo(() => computeStudentPoints(records), [records]);
  const earned = useMemo(() => computeStudentBadges(records), [records]);
  const earnedIds = useMemo(() => new Set(earned.map(b => b.id)), [earned]);

  const level    = LEVELS.find(l => points >= l.min && points <= l.max) ?? LEVELS[0];
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1];
  const progress = nextLevel ? Math.round(((points - level.min) / (nextLevel.min - level.min)) * 100) : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Level card */}
      <div style={{ ...card, background: `linear-gradient(135deg,${level.color}22,${level.color}08)`, border: `1px solid ${level.color}40`, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 56 }}>{level.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>مستواك الحالي</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: level.color, marginBottom: 8 }}>{level.name}</div>
            <div style={{ height: 10, background: "rgba(255,255,255,0.1)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: level.color, borderRadius: 99, transition: "width 1s ease" }} />
            </div>
            {nextLevel && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                {points} / {nextLevel.min} نقطة للوصول إلى <strong style={{ color: nextLevel.color }}>{nextLevel.name}</strong>
              </div>
            )}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: level.color }}>{points}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>نقطة</div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {[
          { icon: "🎖", label: "الشارات المكتسبة", value: earned.length, color: "var(--warning)" },
          { icon: "📝", label: "الاختبارات المُكملة", value: records.length, color: "var(--primary)" },
          { icon: "✅", label: "اجتزتها", value: records.filter(r => r.percentage >= 60).length, color: "var(--success)" },
        ].map(s => (
          <div key={s.label} style={{ ...card, textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Badges grid */}
      <div style={card}>
        <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>🎖 الشارات ({earned.length}/{ALL_BADGE_IDS.length})</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12 }}>
          {ALL_BADGE_IDS.map(id => {
            const meta = ALL_BADGE_META[id]!;
            const got  = earnedIds.has(id);
            const badge = earned.find(b => b.id === id);
            return (
              <div key={id} style={{
                padding: 16, borderRadius: "var(--radius)", textAlign: "center",
                background: got ? "rgba(108,99,255,0.1)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${got ? "var(--primary)" : "var(--border)"}`,
                opacity: got ? 1 : 0.45,
                transition: "all 0.3s",
              }}>
                <div style={{ fontSize: 36, marginBottom: 6, filter: got ? "none" : "grayscale(1)" }}>{meta.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: got ? "var(--text)" : "var(--text-muted)" }}>{meta.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{meta.description}</div>
                {got && badge && (
                  <div style={{ marginTop: 8, fontSize: 10, color: "var(--primary)", fontWeight: 600 }}>
                    ✅ {new Date(badge.earnedAt).toLocaleDateString("ar-SA")}
                  </div>
                )}
                {!got && <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>🔒 لم تُحقَّق بعد</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Earned badges detail */}
      {earned.length > 0 && (
        <div style={card}>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🏅 تاريخ إنجازاتك</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {earned.map(b => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-sm)" }}>
                <span style={{ fontSize: 28 }}>{b.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{b.description}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(b.earnedAt).toLocaleDateString("ar-SA")}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

