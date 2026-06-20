import { useCallback, useEffect, useRef, useState } from "react";
import { ExamEngine, EXAM_DATA } from "@/lib/exam-engine";
import type { ExamState, ExamResult } from "@/lib/exam-engine/types";
import { toast } from "./Toast";

const AR_LETTERS = ["أ", "ب", "ج", "د"];
const LETTERS = ["a", "b", "c", "d"];

interface Props {
  onClose: () => void;
  onComplete: (result: ExamResult) => void;
}

type Screen = "start" | "questions" | "result" | "review";

export function ExamModal({ onClose, onComplete }: Props) {
  const engineRef = useRef(new ExamEngine());
  const [screen, setScreen] = useState<Screen>("start");
  const [state, setState] = useState<ExamState>(() => engineRef.current.createState(EXAM_DATA));
  const [result, setResult] = useState<ExamResult | null>(null);
  const [qTimerSec, setQTimerSec] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<"all" | "correct" | "wrong" | "skipped">("all");
  const examTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const engine = engineRef.current;

  const stopTimers = useCallback(() => {
    if (examTimerRef.current) clearInterval(examTimerRef.current);
    if (qTimerRef.current) clearInterval(qTimerRef.current);
  }, []);

  const finishExam = useCallback(async (currentState: ExamState) => {
    stopTimers();
    const res = await engine.finishExam(currentState, EXAM_DATA);
    setResult(res);
    onComplete(res);
    setScreen("result");
  }, [engine, stopTimers, onComplete]);

  const startQTimer = useCallback((sec: number, currentStateGetter: () => ExamState) => {
    if (qTimerRef.current) clearInterval(qTimerRef.current);
    setQTimerSec(sec);
    let rem = sec;
    qTimerRef.current = setInterval(() => {
      rem--;
      setQTimerSec(rem);
      if (rem <= 0) {
        if (qTimerRef.current) clearInterval(qTimerRef.current);
        // Auto-skip on question timeout
        setState(prev => {
          const next = { ...prev, idx: prev.idx + 1 };
          if (next.idx >= EXAM_DATA.questions.length) {
            finishExam(currentStateGetter());
            return prev;
          }
          startQTimer(EXAM_DATA.questions[next.idx].time, () => next);
          return next;
        });
      }
    }, 1000);
  }, [finishExam]);

  const startExam = useCallback(() => {
    const fresh = engine.createState(EXAM_DATA);
    setState(fresh);
    setScreen("questions");

    examTimerRef.current = setInterval(() => {
      setState(prev => {
        const next = engine.tickTimer(prev);
        if (engine.isTimedOut(next)) {
          finishExam(next);
          return prev;
        }
        return next;
      });
    }, 1000);

    startQTimer(EXAM_DATA.questions[0].time, () => fresh);
  }, [engine, finishExam, startQTimer]);

  useEffect(() => () => { stopTimers(); engine.dispose(); }, [stopTimers, engine]);

  const handleAnswer = (letter: string) => {
    setState(prev => engine.selectAnswer(prev, letter));
  };

  const handleNext = () => {
    setState(prev => {
      const next = { ...prev, idx: prev.idx + 1 };
      if (next.idx >= EXAM_DATA.questions.length) return prev;
      startQTimer(EXAM_DATA.questions[next.idx].time, () => next);
      return next;
    });
  };

  const handleSkip = () => {
    setState(prev => {
      const next = { ...prev, idx: prev.idx + 1 };
      if (next.idx >= EXAM_DATA.questions.length) {
        finishExam(prev);
        return prev;
      }
      startQTimer(EXAM_DATA.questions[next.idx].time, () => next);
      return next;
    });
  };

  const handleSubmit = () => finishExam(state);

  const handleRetry = () => {
    setResult(null);
    setScreen("start");
    stopTimers();
  };

  const q = EXAM_DATA.questions[state.idx];
  const isLast = state.idx === EXAM_DATA.questions.length - 1;
  const progress = Math.round(((state.idx + 1) / EXAM_DATA.questions.length) * 100);

  const { label: resultLabel, color: resultColor } = result
    ? engine.getResultLabel(result.percentage)
    : { label: "", color: "" };

  const resultRingOffset = result
    ? 339 - (339 * result.percentage) / 100
    : 339;

  const filteredResults = result?.answerResults.filter(r => {
    if (reviewFilter === "all") return true;
    return r.status === reviewFilter;
  }) ?? [];

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget && screen !== "questions") onClose(); }}>
      <div className="modal" style={{ maxWidth: screen === "questions" || screen === "result" || screen === "review" ? 920 : 680 }}>
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 14, left: 14, width: 32, height: 32, background: "var(--card-hover)", border: "none", borderRadius: "50%", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}
        >✕</button>

        {/* START SCREEN */}
        {screen === "start" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 20, fontSize: 48, color: "var(--primary)" }}>📄</div>
            <h3 style={{ textAlign: "center", fontSize: 20, fontWeight: 800, marginBottom: 24, background: "linear-gradient(135deg, var(--primary), var(--secondary))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {EXAM_DATA.title}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "سؤال", value: EXAM_DATA.questions.length },
                { label: "دقيقة", value: EXAM_DATA.totalTime },
                { label: "درجة", value: EXAM_DATA.totalScore },
              ].map(item => (
                <div key={item.label} style={{ textAlign: "center", padding: 14, borderRadius: "var(--radius-sm)", background: "var(--card)", border: "1px solid var(--border)" }}>
                  <strong style={{ display: "block", fontSize: 22, fontWeight: 800 }}>{item.value}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 20 }}>
              <p style={{ fontWeight: 700, marginBottom: 10 }}>ℹ️ تعليمات الاختبار:</p>
              <ul style={{ listStyle: "disc", paddingRight: 20, color: "var(--text-muted)", fontSize: 14, lineHeight: 2 }}>
                <li>لكل سؤال وقت محدد، عند انتهائه يُعدّ السؤال متخطَّى.</li>
                <li>لا يمكن العودة لسؤال تم تخطيه.</li>
                <li>عند انتهاء وقت الاختبار تُرسل الإجابات تلقائياً.</li>
                <li>يعمل الاختبار بالكامل على جهازك دون الحاجة للإنترنت.</li>
              </ul>
            </div>
            <button onClick={startExam} style={{ width: "100%", padding: "13px 28px", background: "linear-gradient(135deg, var(--success), #00a07a)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              ▶ ابدأ الاختبار الآن
            </button>
          </div>
        )}

        {/* QUESTIONS SCREEN */}
        {screen === "questions" && q && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: "14px 18px", background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.15)", borderRadius: "var(--radius-sm)", marginBottom: 20, fontSize: 14 }}>
              <span>🕐 الوقت: <strong>{engine.formatTimer(state)}</strong></span>
              <span>📋 <strong>{state.idx + 1}</strong>/<strong>{EXAM_DATA.questions.length}</strong></span>
              <span>⭐ <strong>{state.score}</strong>/<strong>{EXAM_DATA.totalScore}</strong></span>
            </div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>
              السؤال {state.idx + 1} من {EXAM_DATA.questions.length}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ background: "rgba(255,165,2,0.1)", color: "var(--warning)", padding: "4px 10px", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>
                {q.pts} درجات
              </span>
              <span className="blink" style={{ background: "rgba(255,71,87,0.1)", color: "var(--danger)", padding: "4px 10px", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>
                ⏱ {qTimerSec} ث
              </span>
            </div>
            <p style={{ fontSize: 17, fontWeight: 600, marginBottom: 20, lineHeight: 1.7 }}>
              {state.idx + 1}. {q.text}
            </p>
            <div className="q-options-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {q.opts.map((opt, oi) => (
                <div
                  key={oi}
                  className={`q-option ${state.answers[state.idx] === LETTERS[oi] ? "selected" : ""}`}
                  onClick={() => handleAnswer(LETTERS[oi])}
                >
                  <div className="q-option-letter">{AR_LETTERS[oi]}</div>
                  {opt}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <button onClick={handleSkip} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                ⏩ تخطي
              </button>
              {!isLast && (
                <button onClick={handleNext} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: "linear-gradient(135deg, var(--primary), var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  التالي ›
                </button>
              )}
              {isLast && (
                <button onClick={handleSubmit} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: "linear-gradient(135deg, var(--success), #00a07a)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  🏁 إنهاء
                </button>
              )}
            </div>
          </div>
        )}

        {/* RESULT SCREEN */}
        {screen === "result" && result && (
          <div>
            <h3 style={{ textAlign: "center", fontSize: 20, fontWeight: 800, marginBottom: 24, background: "linear-gradient(135deg, var(--primary), var(--secondary))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              نتيجة الاختبار
            </h3>
            <svg viewBox="0 0 120 120" width={140} height={140} style={{ display: "block", margin: "0 auto 20px" }}>
              <circle className="grade-ring-track" cx="60" cy="60" r="54" transform="rotate(-90 60 60)" />
              <circle className="grade-ring-fill" cx="60" cy="60" r="54" transform="rotate(-90 60 60)" style={{ strokeDashoffset: resultRingOffset, stroke: resultColor }} />
              <text x="60" y="56" textAnchor="middle" fill="var(--text)" fontSize="18" fontWeight="900" style={{ direction: "ltr" }}>{result.percentage}%</text>
              <text x="60" y="72" textAnchor="middle" fill="var(--text-muted)" fontSize="10">{resultLabel}</text>
            </svg>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: resultColor }}>{result.percentage}%</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: resultColor }}>{resultLabel}</div>
              {result.gpuMode && result.gpuMode !== "cpu" && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                  ⚡ معالجة GPU ({result.gpuMode}) — {result.processingMs.toFixed(1)}ms
                </div>
              )}
            </div>
            <div className="result-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
              {[
                { label: "درجتك", value: result.score, color: "var(--success)" },
                { label: "صحيح", value: result.correct, color: "var(--info)" },
                { label: "خطأ/تخطي", value: result.wrong + result.skipped, color: "var(--danger)" },
              ].map(item => (
                <div key={item.label} style={{ textAlign: "center", padding: 14, borderRadius: "var(--radius-sm)", background: "var(--card)", border: `1px solid ${item.color}` }}>
                  <strong style={{ display: "block", fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 24, marginBottom: 20 }}>
              <h4 style={{ marginBottom: 14, fontSize: 15 }}>تحليل الأداء</h4>
              {[
                { label: "إجابات صحيحة", pct: Math.round((result.correct / result.skipped + result.correct + result.wrong > 0 ? result.correct / EXAM_DATA.questions.length * 100 : 0)), color: "var(--success)" },
                { label: "إجابات خاطئة", pct: Math.round(result.wrong / EXAM_DATA.questions.length * 100), color: "var(--danger)" },
                { label: "أسئلة متخطاة", pct: Math.round(result.skipped / EXAM_DATA.questions.length * 100), color: "var(--warning)" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 120, fontSize: 13, flexShrink: 0 }}>{row.label}</div>
                  <div style={{ flex: 1, height: 14, background: "var(--border)", borderRadius: 7, overflow: "hidden" }}>
                    <div style={{ width: `${row.pct}%`, height: "100%", background: row.color, borderRadius: 7, transition: "width 1s ease" }} />
                  </div>
                  <div style={{ width: 36, fontSize: 12, fontWeight: 700 }}>{row.pct}%</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => setScreen("review")} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: "linear-gradient(135deg, var(--info), #2266cc)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                👁 مراجعة الإجابات
              </button>
              <button onClick={handleRetry} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: "linear-gradient(135deg, var(--primary), var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                🔄 إعادة المحاولة
              </button>
              <button onClick={onClose} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                ✕ إغلاق
              </button>
            </div>
          </div>
        )}

        {/* REVIEW SCREEN */}
        {screen === "review" && result && (
          <div>
            <h3 style={{ textAlign: "center", fontSize: 20, fontWeight: 800, marginBottom: 24, background: "linear-gradient(135deg, var(--primary), var(--secondary))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              مراجعة الإجابات
            </h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {(["all", "correct", "wrong", "skipped"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setReviewFilter(f)}
                  style={{ padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "none", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", background: reviewFilter === f ? "var(--primary)" : "var(--card-hover)", color: reviewFilter === f ? "#fff" : "var(--text-muted)" }}
                >
                  {f === "all" ? "الكل" : f === "correct" ? "صحيح" : f === "wrong" ? "خطأ" : "متخطي"}
                </button>
              ))}
            </div>
            <div style={{ maxHeight: 440, overflowY: "auto" }}>
              {filteredResults.map((r, i) => {
                const q = EXAM_DATA.questions[r.questionIdx];
                const statusColor = r.status === "correct" ? "var(--success)" : r.status === "wrong" ? "var(--danger)" : "var(--warning)";
                return (
                  <div key={i} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>س {r.questionIdx + 1}: {q.text}</span>
                      <span style={{ color: statusColor, fontSize: 13, fontWeight: 700 }}>
                        {r.status === "correct" ? "✅ صحيح" : r.status === "wrong" ? "❌ خطأ" : "⏭ متخطي"}
                      </span>
                    </div>
                    {r.chosen && (
                      <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 5, background: r.status === "correct" ? "rgba(0,200,150,0.1)" : "rgba(255,71,87,0.1)", border: `1px solid ${statusColor}`, fontSize: 13 }}>
                        إجابتك: {q.opts[LETTERS.indexOf(r.chosen)]}
                      </div>
                    )}
                    {r.status !== "correct" && (
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(0,200,150,0.1)", border: "1px solid var(--success)", fontSize: 13 }}>
                        ✅ الإجابة الصحيحة: {q.opts[LETTERS.indexOf(r.correct)]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 14 }}>
              <button onClick={() => setScreen("result")} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                ‹ العودة للنتيجة
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

