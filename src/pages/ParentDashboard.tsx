/**
 * ParentDashboard — لوحة ولي الأمر
 * يرى درجات ابنه، حضوره، واجباته، إنجازاته، ويطبع تقرير أداء
 */
import { useState } from "react";
import type { Parent, Student } from "../lib/db";
import {
  getStudents, getExamRecords, getSubjects,
  getChapterProgress, getHomeworkForStudent, getHomeworkSubmissions,
  getAttendanceForStudent, computeStudentPoints, computeStudentBadges,
} from "../lib/db";
import { printProgressReport } from "@/contexts/components/ProgressReportPDF";
import { UserAvatar } from "@/contexts/components/UserAvatar";

interface Props { user: Parent; onLogout: () => void; }

type Tab = "home" | "grades" | "homework" | "attendance" | "progress";

function pct(val: number, total: number) {
  if (!total) return 0;
  return Math.round((val / total) * 100);
}

export function ParentDashboard({ user, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("home");

  const child: Student | undefined = getStudents().find(s => s.id === user.studentId);
  const subjects   = getSubjects();
  const allRecords = getExamRecords();
  const childRecs  = allRecords.filter(r => child && r.studentEmail === child.email);

  const NAV: { id: Tab; icon: string; label: string }[] = [
    { id: "home",       icon: "🏠", label: "الرئيسية" },
    { id: "grades",     icon: "📊", label: "الدرجات" },
    { id: "homework",   icon: "📋", label: "الواجبات" },
    { id: "attendance", icon: "🗓", label: "الحضور" },
    { id: "progress",   icon: "📈", label: "التقدم" },
  ];

  const card: React.CSSProperties = {
    background: "var(--card)", border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius)", padding: 20,
  };

  if (!child) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ textAlign: "center", ...card, padding: 48 }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>👨‍👩‍👧</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>لم يُربط حساب الطالب</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
            تواصل مع مدير النظام لربط حسابك بحساب ابنك/ابنتك
          </p>
          <button onClick={onLogout} style={{ padding: "10px 28px", background: "var(--primary)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  /* ── Stats ── */
  const examCount   = childRecs.length;
  const passedCount = childRecs.filter(r => r.percentage >= 60).length;
  const avgScore    = examCount ? Math.round(childRecs.reduce((s, r) => s + r.percentage, 0) / examCount) : 0;
  const points      = computeStudentPoints(childRecs);
  const badges      = computeStudentBadges(childRecs);

  /* ── Homework ── */
  const allHW  = getHomeworkForStudent(child);
  const subs   = getHomeworkSubmissions().filter(s => s.studentId === child.id);
  const doneCt = subs.filter(s => s.grade !== undefined).length;

  /* ── Attendance ── */
  const attRecs   = getAttendanceForStudent(child.id);
  const presentCt = attRecs.filter(r => r.status === "present").length;

  /* ── Chapter Progress ── */
  const chProg = getChapterProgress().filter(p => p.studentId === child.id);

  /* ── Per-subject grades ── */
  const subjectStats = subjects.map(s => {
    const recs = childRecs.filter(r => r.subjectId === s.id);
    const avg  = recs.length ? Math.round(recs.reduce((a, r) => a + r.percentage, 0) / recs.length) : null;
    return { subject: s, recs, avg };
  }).filter(x => x.recs.length > 0);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font)", direction: "rtl" }}>

      {/* ── Header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(var(--card-rgb,30,27,46),0.92)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--glass-border)",
        padding: "0 20px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>👨‍👩‍👧</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>بوابة ولي الأمر</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{user.name}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => printProgressReport(child, childRecs, subjects, attRecs, subs, allHW, badges, points)}
            style={{ padding: "7px 14px", background: "var(--primary)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            📄 تقرير PDF
          </button>
          <button onClick={onLogout} style={{ padding: "7px 14px", background: "none", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            خروج
          </button>
        </div>
      </header>

      <div style={{ display: "flex", minHeight: "calc(100vh - 64px)" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: 200, flexShrink: 0, borderLeft: "1px solid var(--glass-border)", padding: "20px 10px", display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 64, height: "calc(100vh - 64px)", overflowY: "auto" }}>

          {/* Child card */}
          <div style={{ ...card, marginBottom: 16, textAlign: "center", padding: "14px 10px" }}>
            <UserAvatar name={child.name} size={48} />
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8 }}>{child.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
              {child.stage === "primary" ? "ابتدائي" : child.stage === "middle" ? "متوسط" : "ثانوي"}
              {" · الصف "}{child.grade}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, display: "inline-block", padding: "3px 8px", borderRadius: 12, background: "rgba(0,200,150,0.1)", color: "var(--success)", fontWeight: 700 }}>
              {points} نقطة · {badges.length} شارة
            </div>
          </div>

          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit",
                background: tab === n.id ? "rgba(108,99,255,0.15)" : "transparent",
                color: tab === n.id ? "var(--primary)" : "var(--text-muted)",
                fontWeight: tab === n.id ? 800 : 500, fontSize: 13, textAlign: "right",
              }}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>

          {/* HOME */}
          {tab === "home" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 20 }}>
                🏠 مرحباً، {user.name}
              </h2>

              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16, marginBottom: 28 }}>
                {[
                  { icon: "📝", label: "الاختبارات", value: examCount, color: "var(--primary)" },
                  { icon: "✅", label: "النجاحات", value: passedCount, color: "var(--success)" },
                  { icon: "📊", label: "المتوسط", value: `${avgScore}%`, color: "var(--secondary)" },
                  { icon: "📋", label: "الواجبات المنجزة", value: `${doneCt}/${allHW.length}`, color: "var(--warning)" },
                  { icon: "🗓", label: "جلسات الحضور", value: presentCt, color: "#06b6d4" },
                  { icon: "🏆", label: "النقاط", value: points, color: "#f59e0b" },
                ].map(s => (
                  <div key={s.label} style={{ ...card, textAlign: "center", padding: "16px 12px" }}>
                    <div style={{ fontSize: 26, marginBottom: 6 }}>{s.icon}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Latest exam results */}
              <div style={{ ...card }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, borderBottom: "1px solid var(--glass-border)", paddingBottom: 10 }}>
                  📝 آخر نتائج الاختبارات
                </div>
                {childRecs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>لا توجد اختبارات بعد</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {childRecs.slice(-5).reverse().map(r => {
                      const subj = subjects.find(s => s.id === r.subjectId);
                      const passed = r.percentage >= 60;
                      return (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: passed ? "rgba(0,200,150,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${passed ? "rgba(0,200,150,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                          <span style={{ fontSize: 20 }}>{subj?.icon ?? "📝"}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{r.examTitle}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{subj?.name}</div>
                          </div>
                          <span style={{ fontSize: 18, fontWeight: 900, color: passed ? "var(--success)" : "var(--danger)" }}>{r.percentage}%</span>
                          <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: passed ? "rgba(0,200,150,0.1)" : "rgba(239,68,68,0.1)", color: passed ? "var(--success)" : "var(--danger)" }}>{passed ? "نجح" : "راجع"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GRADES */}
          {tab === "grades" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📊 الدرجات والنتائج</h2>
              {subjectStats.length === 0 ? (
                <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--text-muted)" }}>لا توجد نتائج بعد</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {subjectStats.map(({ subject: s, recs, avg }) => (
                    <div key={s.id} style={{ ...card }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                        <span style={{ fontSize: 28 }}>{s.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 800 }}>{s.name}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{recs.length} اختبار</div>
                        </div>
                        {avg !== null && (
                          <div style={{ fontSize: 24, fontWeight: 900, color: avg >= 60 ? "var(--success)" : "var(--danger)" }}>
                            {avg}%
                          </div>
                        )}
                      </div>
                      {avg !== null && (
                        <div style={{ height: 6, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${avg}%`, background: avg >= 60 ? "var(--success)" : "var(--danger)", borderRadius: 4, transition: "width 0.5s" }} />
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                        {recs.map(r => (
                          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderRadius: 8, background: "var(--bg)", fontSize: 13 }}>
                            <span style={{ color: "var(--text-muted)" }}>{r.examTitle}</span>
                            <span style={{ fontWeight: 700, color: r.percentage >= 60 ? "var(--success)" : "var(--danger)" }}>{r.percentage}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HOMEWORK */}
          {tab === "homework" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>📋 الواجبات</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
                منجز {doneCt} من {allHW.length} واجب
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {allHW.length === 0 ? (
                  <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--text-muted)" }}>لا توجد واجبات</div>
                ) : allHW.map(hw => {
                  const sub = subs.find(s => s.homeworkId === hw.id);
                  const subj = subjects.find(s => s.id === hw.subjectId);
                  return (
                    <div key={hw.id} style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ fontSize: 24 }}>{subj?.icon ?? "📋"}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{hw.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{subj?.name} {hw.dueDate ? `· موعد التسليم: ${hw.dueDate}` : ""}</div>
                      </div>
                      <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: !sub ? "rgba(245,158,11,0.1)" : sub.grade !== undefined ? "rgba(0,200,150,0.1)" : "rgba(59,130,246,0.1)",
                        color: !sub ? "var(--warning)" : sub.grade !== undefined ? "var(--success)" : "#3b82f6" }}>
                        {!sub ? "لم يُسلَّم" : sub.grade !== undefined ? `${sub.grade}/10 ✅` : "قيد المراجعة"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ATTENDANCE */}
          {tab === "attendance" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>🗓 سجل الحضور</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
                حضر {presentCt} من {attRecs.length} جلسة ({pct(presentCt, attRecs.length)}%)
              </p>
              {attRecs.length === 0 ? (
                <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--text-muted)" }}>لا سجلات حضور بعد</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {attRecs.slice().reverse().map(r => {
                    const subj = subjects.find(s => s.id === r.subjectId);
                    return (
                      <div key={r.id} style={{ ...card, display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
                        <span style={{ fontSize: 20 }}>{r.status === "present" ? "✅" : r.status === "late" ? "⏰" : "❌"}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{subj?.name ?? "جلسة"}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.date}</div>
                        </div>
                        <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                          background: r.status === "present" ? "rgba(0,200,150,0.1)" : r.status === "late" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                          color: r.status === "present" ? "var(--success)" : r.status === "late" ? "var(--warning)" : "var(--danger)" }}>
                          {r.status === "present" ? "حاضر" : r.status === "late" ? "متأخر" : "غائب"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* PROGRESS */}
          {tab === "progress" && (
            <div className="fade-in">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📈 تقدم القراءة والإنجازات</h2>

              {/* Badges */}
              <div style={{ ...card, marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>🏅 الشارات المكتسبة ({badges.length})</div>
                {badges.length === 0 ? (
                  <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 20 }}>لم يكتسب شارات بعد</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {badges.map(b => (
                      <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(108,99,255,0.1)", borderRadius: 20, border: "1px solid rgba(108,99,255,0.2)" }}>
                        <span style={{ fontSize: 18 }}>{b.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{b.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chapter progress */}
              <div style={{ ...card }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>📚 الفصول المقروءة ({chProg.length})</div>
                {chProg.length === 0 ? (
                  <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 20 }}>لم يقرأ فصولاً بعد</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {chProg.slice().reverse().map(p => {
                      const subj = subjects.find(s => s.id === p.subjectId);
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.15)" }}>
                          <span>✅</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.chapterTitle}</div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{subj?.icon} {subj?.name}</div>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {new Date(p.readAt).toLocaleDateString("ar-SA")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

