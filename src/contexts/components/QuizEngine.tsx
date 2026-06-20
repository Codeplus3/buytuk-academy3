import { useState } from "react";
import type { Exam, Question, ExamRecord } from "../lib/db";

/* ── constants ──────────────────────────────────────────────────────────── */
const AR   = ["أ", "ب", "ج", "د"];
const DIFF: Record<string, { label: string; color: string }> = {
  easy:   { label: "سهل",    color: "var(--success)" },
  medium: { label: "متوسط",  color: "var(--warning)" },
  hard:   { label: "صعب",    color: "var(--danger)"  },
};

/* ── helpers ────────────────────────────────────────────────────────────── */
const btn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "10px 22px", borderRadius: "var(--radius-sm)",
  cursor: "pointer", fontSize: 13, fontWeight: 700,
  transition: "opacity 0.15s ease", border: "none",
  ...extra,
});

/* ── Result Screen ──────────────────────────────────────────────────────── */
function ResultScreen({
  result, passed, passingPct, examTitle, onExit,
}: {
  result: ExamRecord;
  passed: boolean;
  passingPct: number;
  examTitle: string;
  onExit: () => void;
}) {
  const ring = passed ? "var(--success)" : "var(--danger)";
  return (
    <div className="quiz-question" style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 12 }}>
        {passed ? "🎉" : "📚"}
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, color: "var(--text)" }}>{examTitle}</h2>

      {/* Score ring */}
      <div style={{
        width: 120, height: 120, borderRadius: "50%",
        border: `6px solid ${ring}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        margin: "20px auto",
        background: `${passed ? "rgba(0,200,136,0.08)" : "rgba(255,71,87,0.08)"}`,
      }}>
        <span style={{ fontSize: 32, fontWeight: 900, color: ring, lineHeight: 1 }}>
          {result.percentage}%
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>النتيجة</span>
      </div>

      {/* Pass / Fail badge */}
      <div style={{
        display: "inline-block", padding: "6px 20px", borderRadius: 999,
        background: passed ? "rgba(0,200,136,0.15)" : "rgba(255,71,87,0.12)",
        color: ring, fontWeight: 800, fontSize: 15, marginBottom: 28,
        border: `1.5px solid ${ring}`,
      }}>
        {passed ? "✅ ناجح" : "❌ يحتاج مراجعة"}
        <span style={{ fontSize: 12, fontWeight: 400, marginInlineStart: 6 }}>
          (الحد الأدنى {passingPct}%)
        </span>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 32 }}>
        {[
          { label: "إجابات صحيحة", value: result.correct,  color: "var(--success)" },
          { label: "إجابات خاطئة",  value: result.wrong,    color: "var(--danger)"  },
          { label: "متخطّاة",        value: result.skipped,  color: "var(--warning)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            padding: "14px 8px", borderRadius: "var(--radius-sm)",
            background: "var(--card)", border: "1px solid var(--border)",
          }}>
            <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Score detail */}
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 28 }}>
        الدرجة: <strong style={{ color: "var(--primary)" }}>{result.score}</strong> من {result.maxScore} نقطة
      </p>

      <button onClick={onExit} style={btn({ background: "var(--primary)", color: "#fff", fontSize: 14, paddingInline: 32 })}>
        ← العودة للاختبارات
      </button>
    </div>
  );
}

/* ── QuizEngine ─────────────────────────────────────────────────────────── */
interface Props {
  exam:      Exam;
  questions: Question[];
  onDone:    (r: ExamRecord) => void;
  onExit:    () => void;
}

export function QuizEngine({ exam, questions, onDone, onExit }: Props) {
  const [idx,     setIdx]     = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(questions.length).fill(null)
  );
  const [phase,  setPhase]  = useState<"quiz" | "result">("quiz");
  const [result, setResult] = useState<ExamRecord | null>(null);

  const total    = questions.length;
  const q        = questions[idx];
  const progress = total > 0 ? ((idx + 1) / total) * 100 : 0;

  const choose = (i: number) => {
    const a = [...answers]; a[idx] = i; setAnswers(a);
  };

  const goNext = () => {
    if (idx < total - 1) setIdx(i => i + 1);
    else submit();
  };

  const skip = () => {
    if (idx < total - 1) setIdx(i => i + 1);
    else submit();
  };

  const submit = () => {
    let correct = 0, wrong = 0, skipped = 0, score = 0, maxScore = 0;
    questions.forEach((question, i) => {
      maxScore += question.points;
      if (answers[i] === null)                         skipped++;
      else if (answers[i] === question.correctIndex) { correct++; score += question.points; }
      else                                             wrong++;
    });
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const record: ExamRecord = {
      id: Date.now(), studentEmail: "",
      examId: exam.id, examTitle: exam.title, subjectId: exam.subjectId,
      score, maxScore, percentage, correct, wrong, skipped,
      durationMs: 0, completedAt: new Date().toLocaleDateString("ar-SA"),
    };
    setResult(record);
    setPhase("result");
    onDone(record);
  };

  /* ── result phase ── */
  if (phase === "result" && result) {
    return (
      <ResultScreen
        result={result}
        passed={result.percentage >= exam.passingPct}
        passingPct={exam.passingPct}
        examTitle={exam.title}
        onExit={onExit}
      />
    );
  }

  if (!q) return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
      لا توجد أسئلة في هذا الاختبار
    </div>
  );

  const selected = answers[idx];
  const diffInfo = DIFF[q.difficulty] ?? DIFF["medium"]!;
  const isLast   = idx === total - 1;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text)" }}>{exam.title}</h3>
        <button onClick={onExit} style={btn({
          background: "rgba(255,71,87,0.1)", color: "var(--danger)",
          border: "1px solid var(--danger)", padding: "6px 14px",
        })}>
          ✕ إنهاء
        </button>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
          <span>السؤال <strong style={{ color: "var(--primary)" }}>{idx + 1}</strong> من {total}</span>
          <span style={{ fontWeight: 700, color: "var(--primary)" }}>{q.points} نقطة</span>
        </div>
        <div style={{ height: 7, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: "linear-gradient(90deg, var(--primary), #a78bfa)",
            borderRadius: 4, transition: "width 0.3s ease",
          }} />
        </div>
      </div>

      {/* ── Question card — key=idx triggers re-animation ── */}
      <div
        key={idx}
        className="quiz-question"
        style={{
          background: "var(--card)", borderRadius: "var(--radius)",
          border: "1px solid var(--border)", padding: "24px 20px", marginBottom: 20,
        }}
      >
        {/* Difficulty badge */}
        <span style={{
          fontSize: 11, fontWeight: 700, color: diffInfo.color,
          background: `color-mix(in srgb, ${diffInfo.color} 12%, transparent)`,
          padding: "3px 10px", borderRadius: 999, marginBottom: 14, display: "inline-block",
          border: `1px solid color-mix(in srgb, ${diffInfo.color} 30%, transparent)`,
        }}>
          {diffInfo.label}
        </span>

        {/* Question text */}
        <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.8, marginBottom: 22, color: "var(--text)" }}>
          {q.text}
        </p>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.options.map((opt, i) => {
            const active = selected === i;
            return (
              <button key={i} onClick={() => choose(i)} style={{
                padding: "13px 16px", borderRadius: "var(--radius-sm)",
                border: `2px solid ${active ? "var(--primary)" : "var(--border)"}`,
                background: active ? "rgba(108,99,255,0.12)" : "var(--bg)",
                cursor: "pointer", textAlign: "start", fontSize: 14,
                fontWeight: active ? 700 : 400,
                display: "flex", gap: 12, alignItems: "center",
                transition: "border-color 0.18s ease, background 0.18s ease",
                color: "var(--text)",
              }}>
                <span style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                  background: active ? "var(--primary)" : "rgba(108,99,255,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 900,
                  color: active ? "#fff" : "var(--primary)",
                  transition: "background 0.18s ease, color 0.18s ease",
                }}>
                  {AR[i]}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {/* Skip */}
        <button onClick={skip} style={btn({
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
        })}>
          تخطي ⟩
        </button>

        {/* Next / Submit */}
        <button
          onClick={goNext}
          style={btn({
            background: isLast ? "var(--success)" : "var(--primary)",
            color: "#fff",
            opacity: selected === null && !isLast ? 0.6 : 1,
          })}
        >
          {isLast ? "✅ إرسال الاختبار" : "التالي →"}
        </button>
      </div>

      {/* Answered indicators */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 20, justifyContent: "center" }}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: "50%",
            background: i === idx
              ? "var(--primary)"
              : answers[i] !== null ? "rgba(108,99,255,0.4)" : "var(--border)",
            transition: "background 0.2s",
            cursor: "pointer",
          }} onClick={() => setIdx(i)} title={`سؤال ${i + 1}`} />
        ))}
      </div>
    </div>
  );
}
