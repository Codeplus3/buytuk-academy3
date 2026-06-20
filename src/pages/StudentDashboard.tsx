import { useState, useEffect, useMemo } from "react";
import { UserAvatar } from "../components/UserAvatar";
import { GlobalSocialLinks } from "../components/GlobalSocialLinks";
import { QuizEngine } from "../components/QuizEngine";
import {
  getExamRecords, saveExamRecords,
  getSubjectsForStudent, getPublishedExamsForStudent, getQuestions,
  saveStudents, getStudents,
  STAGE_LABELS, STAGE_ICONS, TRACK_LABELS, TRACK_ICONS, GRADES_BY_STAGE, TRACKS_BY_STAGE,
  isStudentSubscribed,
  computeStudentPoints, computeStudentBadges,
  getHomeworkForStudent, getHomeworkSubmissions,
  pushNotification,
} from "../lib/db";
import { syncEngine } from "../lib/sync-engine";
import { downloadAndInstallBundle, getBundleInstallInfo, type BundleProgress } from "../lib/bundle-manager";
import type { Student, Subject, ExamRecord, AcademicStage, AcademicTrack, Exam, Question, Message, EmbedVideo } from "../lib/db";
import { toast } from "../components/Toast";
import { StudyRoom } from "../components/StudyRoom";
import { OfflineMediaPanel } from "../components/OfflineMediaPanel";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { LessonLibrary } from "../components/LessonLibrary";
import { PerformanceChart } from "../components/PerformanceChart";
import { GamificationPanel } from "../components/GamificationPanel";
import { ExamCalendar } from "../components/ExamCalendar";
import { HomeworkPanel } from "../components/HomeworkPanel";
import { AnnouncementBanner } from "../components/AnnouncementBanner";
import { NotificationCenter } from "../components/NotificationCenter";
import { GlobalSearch } from "../components/GlobalSearch";
import { CertificateModal } from "../components/CertificateModal";
import { LiveSessionViewer } from "../components/LiveSessionViewer";
import { StudentAttendanceView } from "../components/StudentAttendanceView";
import { PeerReviewPanel } from "../components/PeerReviewPanel";
import { DirectMessagePanel } from "../components/DirectMessagePanel";
import { Leaderboard } from "../components/Leaderboard";
import { StudyNotesPanel } from "../components/StudyNotesPanel";
import { TimetablePanel } from "../components/TimetablePanel";
import { TeacherRatingPanel } from "../components/TeacherRatingPanel";
import { ProgressReportButton } from "../components/ProgressReportPDF";
import { StudentTicketsPanel } from "../components/StudentTicketsPanel";
import { Storefront } from "../components/Storefront";
import { getAttendanceForStudent } from "../lib/db";

type Tab = "home" | "sections" | "exams" | "grades" | "media" | "profile" | "practice" | "messages" | "performance" | "calendar" | "gamification" | "homework" | "sessions" | "attendance" | "peerreview" | "leaderboard" | "notes" | "timetable" | "rating" | "tickets" | "store";

const DIFFICULTY_COLORS: Record<string, string> = { easy: "#00c896", medium: "#f59e0b", hard: "#ef4444" };
const DIFFICULTY_LABELS: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };

interface Props { user: Student; onLogout: () => void; }

/* ── Sync status badge — cosmetic only, never blocks study or exam flow ─── */
function SyncBadge({ state, lastSyncAt, pendingPush }: { state: string; lastSyncAt: number; pendingPush: number }) {
  const icon  = state === "syncing" ? "🔄" : state === "error" ? "⚠️" : state === "offline" ? "📴" : "✅";
  const label = state === "syncing"
    ? "جارٍ المزامنة…"
    : state === "error"
    ? "خطأ في المزامنة"
    : state === "offline"
    ? "غير متصل"
    : lastSyncAt > 0
    ? `مزامنة: ${new Date(lastSyncAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`
    : "مزامنة ذكية";
  const color = state === "syncing" ? "var(--primary)"
    : state === "error" ? "var(--warning)"
    : state === "offline" ? "#94a3b8"
    : "var(--success)";

  return (
    <div title={pendingPush > 0 ? `${pendingPush} عملية في الانتظار` : label}
      style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        borderRadius: 20, fontSize: 11, fontWeight: 600, color,
        transition: "all 0.3s ease", userSelect: "none" }}>
      <span style={{ display: "inline-block", animation: state === "syncing" ? "spin 1s linear infinite" : "none" }}>{icon}</span>
      <span>{label}</span>
      {pendingPush > 0 && <span style={{ background: color, color: "#fff", borderRadius: 10, padding: "1px 5px", fontSize: 10 }}>{pendingPush}</span>}
    </div>
  );
}

/* ─── EmbedVideoSection — shows teacher-added YouTube/Vimeo lessons ─────── */
function EmbedVideoSection({ videos, subjectName }: { videos: EmbedVideo[]; subjectName: string }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div style={{
      marginBottom: 24, background: "var(--card)",
      border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 20,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16, color: "var(--primary)" }}>
        🎬 دروس الفيديو — {subjectName} ({videos.length})
      </h3>

      {/* Playlist list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: activeId ? 16 : 0 }}>
        {videos.map((v, idx) => (
          <div key={v.id}>
            <button
              onClick={() => setActiveId(activeId === v.id ? null : v.id)}
              style={{
                width: "100%", textAlign: "start", padding: "10px 14px",
                background: activeId === v.id ? "rgba(108,99,255,0.12)" : "var(--bg)",
                border: `1px solid ${activeId === v.id ? "var(--primary)" : "var(--glass-border)"}`,
                borderRadius: "var(--radius-sm)", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 10,
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: "50%",
                background: activeId === v.id ? "var(--primary)" : "rgba(108,99,255,0.15)",
                color: activeId === v.id ? "#fff" : "var(--primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 800, flexShrink: 0,
              }}>
                {activeId === v.id ? "▶" : idx + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{v.title}</div>
                {v.description && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.description}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>
                {activeId === v.id ? "▲ إغلاق" : "▼ تشغيل"}
              </span>
            </button>

            {/* Inline player */}
            {activeId === v.id && (
              <div style={{
                borderRadius: "0 0 var(--radius-sm) var(--radius-sm)",
                overflow: "hidden",
                border: "1px solid var(--primary)",
                borderTop: "none",
                aspectRatio: "16/9",
              }}>
                <iframe
                  src={v.embedUrl}
                  width="100%"
                  height="100%"
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                  allowFullScreen
                  style={{ border: "none", display: "block" }}
                  title={v.title}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Practice Panel — student read-only question bank ──────────────────── */
function PracticePanel({
  subjects,
  allQuestions,
  card,
}: {
  subjects:     Subject[];
  allQuestions: Question[];
  card:         React.CSSProperties;
}) {
  const [selSubj,  setSelSubj]  = useState<string>("");
  const [revealed, setRevealed] = useState<Record<string, number | null>>({}); // qId → chosen index
  const AR = ["أ", "ب", "ج", "د"];

  const qs = selSubj
    ? allQuestions.filter(q => q.subjectId === selSubj)
    : [];

  const choose = (qId: string, i: number) => {
    setRevealed(r => r[qId] !== undefined ? r : { ...r, [qId]: i });
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>🏋️ تدريب على الأسئلة</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
        اختر مادة وتدرّب على الأسئلة — اضغط على إجابة لترى إذا كانت صحيحة
      </p>

      {/* Subject selector */}
      <div style={{ marginBottom: 20 }}>
        <select
          className="form-control"
          value={selSubj}
          onChange={e => { setSelSubj(e.target.value); setRevealed({}); }}
          style={{ maxWidth: 340 }}>
          <option value="">— اختر المادة —</option>
          {subjects.map(s => {
            const cnt = allQuestions.filter(q => q.subjectId === s.id).length;
            return <option key={s.id} value={s.id}>{s.icon} {s.name} ({cnt} سؤال)</option>;
          })}
        </select>
      </div>

      {selSubj && qs.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <p style={{ color: "var(--text-muted)" }}>لا توجد أسئلة في هذه المادة بعد</p>
        </div>
      )}

      {qs.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
            {Object.keys(revealed).length} / {qs.length} سؤال تمت الإجابة عليه
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {qs.map((q, qi) => {
              const chosen    = revealed[q.id];
              const answered  = chosen !== undefined;
              const isCorrect = chosen === q.correctIndex;
              return (
                <div key={q.id} style={{ ...card, padding: 18 }}>
                  {/* Question header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
                    <p style={{ fontWeight: 700, lineHeight: 1.7, flex: 1, fontSize: 15 }}>
                      {qi + 1}. {q.text}
                    </p>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <span className="badge" style={{ background: DIFFICULTY_COLORS[q.difficulty] + "22", color: DIFFICULTY_COLORS[q.difficulty] }}>
                        {DIFFICULTY_LABELS[q.difficulty]}
                      </span>
                      <span className="badge badge-info">{q.points} نقطة</span>
                      {answered && (
                        <span className={`badge ${isCorrect ? "badge-success" : "badge-danger"}`}>
                          {isCorrect ? "✅ صحيح" : "❌ خطأ"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Options */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: answered && q.explanation ? 12 : 0 }}>
                    {q.options.map((opt, oi) => {
                      const isChosen  = chosen === oi;
                      const isRight   = oi === q.correctIndex;
                      let bg = "rgba(255,255,255,0.03)";
                      let border = "var(--border)";
                      let color = "var(--text)";
                      if (answered) {
                        if (isRight)         { bg = "rgba(0,200,150,0.12)"; border = "var(--success)"; color = "var(--success)"; }
                        else if (isChosen)   { bg = "rgba(255,71,87,0.1)";  border = "var(--danger)";  color = "var(--danger)"; }
                      } else if (isChosen) {
                        bg = "rgba(108,99,255,0.12)"; border = "var(--primary)"; color = "var(--primary)";
                      }
                      return (
                        <button
                          key={oi}
                          onClick={() => choose(q.id, oi)}
                          disabled={answered}
                          style={{
                            padding: "10px 14px", borderRadius: "var(--radius-sm)",
                            border: `2px solid ${border}`, background: bg, color,
                            cursor: answered ? "default" : "pointer",
                            textAlign: "right", fontSize: 13, fontWeight: isChosen || (answered && isRight) ? 700 : 400,
                            display: "flex", gap: 10, alignItems: "center",
                            transition: "all 0.2s", fontFamily: "inherit",
                          }}>
                          <span style={{ width: 24, height: 24, borderRadius: "50%", background: isChosen || (answered && isRight) ? border : "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                            {AR[oi]}
                          </span>
                          {opt}
                          {answered && isRight && <span style={{ marginRight: "auto" }}>✅</span>}
                          {answered && isChosen && !isRight && <span style={{ marginRight: "auto" }}>❌</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Explanation (only after answering) */}
                  {answered && q.explanation && (
                    <div style={{ padding: "8px 12px", background: "rgba(108,99,255,0.08)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
                      💡 <strong>الشرح:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reset */}
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button
              onClick={() => setRevealed({})}
              style={{ padding: "10px 28px", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", color: "var(--primary)", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
              🔄 إعادة التدريب من البداية
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function StudentDashboard({ user, onLogout }: Props) {
  const [tab, setTab]               = useState<Tab>("home");
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [myRecords, setMyRecords]   = useState<ExamRecord[]>([]);
  const [certRecord,  setCertRecord]  = useState<ExamRecord | null>(null);
  const [certSubject, setCertSubject] = useState<Subject | undefined>(undefined);
  /* ── Inbox messages ─────────────────────────────────────────────── */
  const [myMessages, setMyMessages] = useState<Message[]>(
    () => getStudents().find(s => s.id === user.id)?.messages ?? [],
  );
  const [studySubject, setStudySubject] = useState<Subject | null>(null);

  // Reactive refresh — increments when admin pushes new assets via IDB
  const [refreshTick, setRefreshTick] = useState(0);

  // Academic profile edit
  const [editingProfile, setEditingProfile] = useState(false);
  const [profStage, setProfStage]           = useState<AcademicStage>(user.stage ?? "secondary");
  const [profGrade, setProfGrade]           = useState<number>(user.grade ?? 1);
  const [profTrack, setProfTrack]           = useState<AcademicTrack>(user.track ?? "general");

  useEffect(() => {
    setMyRecords(getExamRecords().filter(r => r.studentEmail === user.email));
  }, [user.email, activeExam]);

  // Listen for subscription changes (same-tab custom event + cross-tab storage event)
  useEffect(() => {
    const onStudentsChanged = () => setRefreshTick(t => t + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "students") setRefreshTick(t => t + 1);
    };
    window.addEventListener("buytuk:students-changed", onStudentsChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("buytuk:students-changed", onStudentsChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Pull subscription from server on mount — ensures fresh status from any device
  useEffect(() => {
    syncEngine.subscriptionSync(user.email).then(updated => {
      if (updated) setRefreshTick(t => t + 1);
    }).catch(() => { /* offline — fine, local data is used */ });
  }, [user.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for admin asset uploads → re-derive subjects & exams instantly
  useEffect(() => {
    const handler = () => {
      setRefreshTick(t => t + 1);
      // Also refresh inbox in case admin sent a message
      setMyMessages(getStudents().find(s => s.id === user.id)?.messages ?? []);
    };
    window.addEventListener("ome-assets-updated", handler);
    return () => window.removeEventListener("ome-assets-updated", handler);
  }, [user.id]);

  // Mark all messages as read when inbox tab is opened
  useEffect(() => {
    if (tab !== "messages") return;
    const freshMsgs = getStudents().find(s => s.id === user.id)?.messages ?? [];
    setMyMessages(freshMsgs);
    if (freshMsgs.some(m => !m.read)) {
      const allStudents = getStudents();
      saveStudents(allStudents.map(s =>
        s.id === user.id
          ? { ...s, messages: (s.messages ?? []).map(m => ({ ...m, read: true })) }
          : s,
      ));
      setMyMessages(freshMsgs.map(m => ({ ...m, read: true })));
    }
  }, [tab, user.id]);

  // Cloud sync status indicator (non-blocking — purely cosmetic)
  const [syncStatus, setSyncStatus] = useState<{ state: string; lastSyncAt: number; pendingPush: number }>(
    { state: "offline", lastSyncAt: 0, pendingPush: 0 },
  );
  useEffect(() => {
    const handler = (e: Event) => setSyncStatus((e as CustomEvent<typeof syncStatus>).detail);
    window.addEventListener("ome-sync-status", handler);
    return () => window.removeEventListener("ome-sync-status", handler);
  }, []);

  const [manualSyncing, setManualSyncing]   = useState(false);
  const [lastSyncMsg,   setLastSyncMsg]     = useState<string>("");

  /* ── Bundle download state ───────────────────────────────────────────────── */
  const [bundleDownloading, setBundleDownloading] = useState<string | null>(null);
  const [bundleProgress,    setBundleProgress]    = useState<BundleProgress | null>(null);

  const handleBundleDownload = async (e: React.MouseEvent, subjectId: string) => {
    e.stopPropagation();
    if (bundleDownloading) return;
    if (!navigator.onLine) {
      toast("يجب الاتصال بالإنترنت لتحميل الحزمة", "warning");
      return;
    }
    setBundleDownloading(subjectId);
    setBundleProgress(null);
    try {
      await downloadAndInstallBundle(subjectId, p => setBundleProgress({ ...p }));
      toast("✅ تم تثبيت المادة كاملة على جهازك", "success");
      setRefreshTick(t => t + 1);
    } catch (err) {
      toast(`⚠️ فشل التحميل: ${err instanceof Error ? err.message : "خطأ"}`, "warning");
    } finally {
      setBundleDownloading(null);
      setTimeout(() => setBundleProgress(null), 4000);
    }
  };

  const doManualSync = async () => {
    if (manualSyncing) return;
    setManualSyncing(true);
    setLastSyncMsg("جارٍ التزامن…");
    try {
      const { applied, subscriptionUpdated } = await syncEngine.manualSync(user.email);
      const parts: string[] = [];
      if (applied > 0) parts.push(`${applied} عنصر جديد`);
      if (subscriptionUpdated) parts.push("تم تحديث الاشتراك");
      setLastSyncMsg(parts.length > 0 ? `✅ ${parts.join(" · ")}` : "✅ المحتوى محدّث");
      if (applied > 0 || subscriptionUpdated) setRefreshTick(t => t + 1);
    } catch {
      setLastSyncMsg("⚠️ تعذّر الاتصال — حاول لاحقاً");
    } finally {
      setManualSyncing(false);
      setTimeout(() => setLastSyncMsg(""), 5000);
    }
  };

  const mySubjects   = useMemo(() => getSubjectsForStudent(user),         [user, refreshTick]);  // eslint-disable-line react-hooks/exhaustive-deps
  const myExams      = useMemo(() => getPublishedExamsForStudent(user),    [user, refreshTick]);  // eslint-disable-line react-hooks/exhaustive-deps
  const allQuestions = useMemo(() => getQuestions(), [refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const myHomework   = useMemo(() => getHomeworkForStudent(user), [user, refreshTick]);  // eslint-disable-line react-hooks/exhaustive-deps
  const hwPending    = useMemo(() => {
    const subs = getHomeworkSubmissions().filter(s => s.studentEmail === user.email);
    const subIds = new Set(subs.map(s => s.homeworkId));
    return myHomework.filter(h => !subIds.has(h.id) && new Date(h.dueDate) >= new Date()).length;
  }, [myHomework, user.email]); // eslint-disable-line react-hooks/exhaustive-deps
  const myPoints   = useMemo(() => computeStudentPoints(myRecords), [myRecords]);
  const myBadges   = useMemo(() => computeStudentBadges(myRecords), [myRecords]);

  /* ── Subscription gate — re-checks fresh data each tick ── */
  const subscribed = useMemo(() => {
    const fresh = getStudents().find(s => s.id === user.id);
    return fresh ? isStudentSubscribed(fresh) : false;
  }, [user.id, refreshTick]);  // eslint-disable-line react-hooks/exhaustive-deps

  const freshStudent = useMemo(() => getStudents().find(s => s.id === user.id) ?? user, [user.id, refreshTick]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Rendered when a gated tab is accessed without an active subscription ── */
  const SubscriptionGate = () => (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 72, marginBottom: 20, filter: "grayscale(0.2)" }}>🔒</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, color: "var(--text)" }}>اشتراكك غير نشط</h2>
      <p style={{ fontSize: 15, color: "var(--text-muted)", maxWidth: 400, lineHeight: 1.8, marginBottom: 24 }}>
        عزيزي الطالب، يرجى التواصل مع الإدارة لتجديد اشتراكك والوصول إلى المواد والاختبارات والمساعد الذكي.
      </p>
      {freshStudent.expiryDate && new Date(freshStudent.expiryDate) < new Date() && (
        <div style={{ padding: "10px 20px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--danger)", marginBottom: 20 }}>
          ❌ انتهى اشتراكك في {new Date(freshStudent.expiryDate).toLocaleDateString("ar-SA")}
        </div>
      )}
      <a href="https://wa.me/201010389600"
        target="_blank" rel="noopener noreferrer"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", background: "#25D366", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700, fontSize: 15, textDecoration: "none", fontFamily: "inherit" }}>
        💬 تواصل مع الإدارة عبر واتساب
      </a>
    </div>
  );

  const best = myRecords.length ? Math.max(...myRecords.map(r => r.percentage)) : null;
  const last = myRecords.length ? myRecords[myRecords.length - 1] : null;
  const avg  = myRecords.length ? Math.round(myRecords.reduce((s, r) => s + r.percentage, 0) / myRecords.length) : null;

  const unreadCount = myMessages.filter(m => !m.read).length;

  const NAV: { id: Tab; icon: string; label: string; badge?: number }[] = [
    { id: "home",         icon: "🏠",  label: "الرئيسية" },
    { id: "sections",     icon: "📚",  label: "موادّي" },
    { id: "practice",     icon: "🏋️", label: "تدريب على الأسئلة" },
    { id: "exams",        icon: "📝",  label: "الاختبارات" },
    { id: "grades",       icon: "📊",  label: "نتائجي" },
    { id: "performance",  icon: "📈",  label: "تقرير الأداء" },
    { id: "calendar",     icon: "📅",  label: "تقويم الاختبارات" },
    { id: "gamification", icon: "🏆",  label: "إنجازاتي" },
    { id: "homework",     icon: "📋",  label: "الواجبات", badge: hwPending },
    { id: "sessions",     icon: "📡",  label: "الجلسات المباشرة" },
    { id: "timetable",    icon: "🗃",  label: "جدول الحصص" },
    { id: "attendance",   icon: "🗓",  label: "حضوري وغيابي" },
    { id: "notes",        icon: "📓",  label: "ملاحظاتي" },
    { id: "leaderboard",  icon: "🏆",  label: "لوحة المتصدرين" },
    { id: "peerreview",   icon: "🤝",  label: "تقييم الأقران" },
    { id: "rating",       icon: "⭐",  label: "تقييم الأساتذة" },
    { id: "store",        icon: "🏪",  label: "المتجر" },
    { id: "tickets",      icon: "🎫",  label: "الدعم الفني" },
    { id: "media",        icon: "🤖",  label: "المكتبة والمساعد" },
    { id: "messages",     icon: "💬",  label: "الرسائل", badge: unreadCount },
    { id: "profile",      icon: "👤",  label: "ملفي الشخصي" },
  ];

  const handleExamDone = (r: ExamRecord) => {
    const filled = { ...r, studentEmail: user.email };
    const all = getExamRecords();
    all.push(filled);
    saveExamRecords(all);
    const newRecords = all.filter(x => x.studentEmail === user.email);
    setMyRecords(newRecords);
    const passed = r.percentage >= (activeExam?.passingPct ?? 60);
    toast(`تم إرسال الاختبار! نسبتك: ${r.percentage}%`, passed ? "success" : "warning");
    if (passed) {
      const subj = mySubjects.find(s => s.id === activeExam?.subjectId);
      setCertSubject(subj);
      setCertRecord(filled);
      pushNotification(user.id, { type: "badge", title: "أحسنت! اجتزت الاختبار 🎉", body: `حصلت على ${r.percentage}% في "${r.examTitle}"` });
    }
    setActiveExam(null);
  };

  const saveProfile = () => {
    const all = getStudents().map(s => s.id === user.id ? { ...s, stage: profStage, grade: profGrade, track: profTrack } : s);
    saveStudents(all);
    user.stage = profStage; user.grade = profGrade; user.track = profTrack;
    setEditingProfile(false);
    toast("تم تحديث ملفك الأكاديمي ✅", "success");
  };

  const card = { background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 20 } as const;
  const label12 = { display: "block" as const, fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 as const };

  return (
    <div>
      <nav className="main-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>🎓</span>
          <span style={{ fontSize: 15, fontWeight: 800, background: "linear-gradient(135deg, var(--primary), var(--secondary))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>بوابة الطالب</span>
        </div>

        {/* ── Sync status badge (offline-first: cosmetic only, never blocks study) ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SyncBadge state={syncStatus.state} lastSyncAt={syncStatus.lastSyncAt} pendingPush={syncStatus.pendingPush} />
          <button
            onClick={() => void doManualSync()}
            disabled={manualSyncing || !navigator.onLine}
            title={!navigator.onLine ? "غير متصل بالإنترنت" : "تحديث المناهج والاشتراك من السيرفر"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 12px",
              background: manualSyncing ? "rgba(108,99,255,0.15)" : "rgba(108,99,255,0.1)",
              border: "1px solid var(--primary)",
              borderRadius: 20, color: "var(--primary)", cursor: manualSyncing ? "default" : "pointer",
              fontSize: 12, fontWeight: 700, fontFamily: "inherit",
              opacity: !navigator.onLine ? 0.5 : 1,
              transition: "all 0.2s",
            }}>
            <span style={{ display: "inline-block", animation: manualSyncing ? "spin 1s linear infinite" : "none" }}>🔄</span>
            {manualSyncing ? "جارٍ…" : "تحديث المناهج"}
          </button>
          {lastSyncMsg && (
            <span style={{ fontSize: 11, color: lastSyncMsg.startsWith("✅") ? "var(--success)" : "var(--warning)", fontWeight: 600 }}>
              {lastSyncMsg}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <GlobalSearch subjects={mySubjects} exams={myExams} homework={myHomework} onSelectTab={(t) => { setActiveExam(null); setTab(t as Tab); }} />
          <NotificationCenter studentId={user.id} />
          <UserAvatar name={user.name} size={36} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>
          <LanguageSwitcher compact />
          <button onClick={onLogout} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>خروج</button>
        </div>
      </nav>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, padding: "24px", maxWidth: 1400, margin: "0 auto" }} className="two-col">
        <aside className="sidebar" style={{ height: "fit-content" }}>
          {NAV.map(n => (
            <button key={n.id} className={`menu-link ${tab === n.id ? "active" : ""}`} onClick={() => { setActiveExam(null); setTab(n.id); }}
              style={{ position: "relative" }}>
              <span>{n.icon}</span>{n.label}
              {!!n.badge && n.badge > 0 && (
                <span style={{ position: "absolute", top: 6, insetInlineStart: 8, minWidth: 18, height: 18, borderRadius: 9, background: "var(--danger)", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{n.badge}</span>
              )}
            </button>
          ))}
          {/* Academic badge */}
          <div style={{ marginTop: 16, padding: 12, background: "rgba(108,99,255,0.08)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>🎒 تصنيفي الأكاديمي</div>
            <div style={{ color: "var(--primary)", marginBottom: 2 }}>{STAGE_ICONS[user.stage] ?? "🏫"} {STAGE_LABELS[user.stage] ?? "—"}</div>
            <div style={{ color: "var(--text-muted)" }}>الصف {user.grade ?? "—"} · {TRACK_LABELS[user.track] ?? "—"}</div>
          </div>
          <GlobalSocialLinks compact />
        </aside>

        <main>
          <AnnouncementBanner />
          {/* ── HOME ── */}
          {tab === "home" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>مرحباً، <span style={{ color: "var(--primary)" }}>{user.name}</span> 👋</h2>
              <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>
                {user.schoolName} · {STAGE_LABELS[user.stage] ?? "—"} · الصف {user.grade ?? "—"} · {TRACK_LABELS[user.track] ?? "—"}
              </p>
              <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 28 }}>
                {[
                  { icon: "📚", label: "موادّي", value: mySubjects.length, color: "var(--primary)" },
                  { icon: "📝", label: "الاختبارات المتاحة", value: myExams.length, color: "var(--info)" },
                  { icon: "🏆", label: "أفضل نتيجة", value: best !== null ? `${best}%` : "—", color: "var(--success)" },
                  { icon: "📊", label: "متوسطي", value: avg !== null ? `${avg}%` : "—", color: "var(--secondary)" },
                ].map(s => (
                  <div key={s.label} className="stat-card">
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{s.icon}</div>
                    <div><div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div><div style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.label}</div></div>
                  </div>
                ))}
              </div>

              {/* ── Gamification mini-widget ── */}
              {myRecords.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
                  <div style={{ ...card, textAlign: "center", padding: 14, background: "linear-gradient(135deg,rgba(245,158,11,0.08),rgba(245,158,11,0.03))" }}>
                    <div style={{ fontSize: 22 }}>⭐</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "var(--warning)" }}>{myPoints}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>نقاطي الإجمالية</div>
                  </div>
                  <div style={{ ...card, textAlign: "center", padding: 14, background: "linear-gradient(135deg,rgba(168,85,247,0.08),rgba(168,85,247,0.03))" }}>
                    <div style={{ fontSize: 22 }}>🏅</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#a855f7" }}>{myBadges.length}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>شاراتي المكتسبة</div>
                  </div>
                  <div style={{ ...card, textAlign: "center", padding: 14, cursor: "pointer", border: "1px solid var(--primary)" }}
                    onClick={() => setTab("gamification")}>
                    <div style={{ fontSize: 22 }}>🏆</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)", marginTop: 4 }}>عرض إنجازاتي</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>اضغط لعرض الكل</div>
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Quick subjects */}
                <div style={card}>
                  <h4 style={{ marginBottom: 14, fontSize: 15, fontWeight: 700 }}>📚 موادّي</h4>
                  {mySubjects.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                      لا توجد مواد تتوافق مع مرحلتك الأكاديمية الحالية
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {mySubjects.slice(0, 4).map(s => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-sm)" }}>
                          <span style={{ fontSize: 22 }}>{s.icon}</span>
                          <div><div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.description}</div></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Last result */}
                <div style={card}>
                  <h4 style={{ marginBottom: 14, fontSize: 15, fontWeight: 700 }}>🏆 آخر نتيجة</h4>
                  {last ? (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 40, fontWeight: 900, color: last.percentage >= 60 ? "var(--success)" : "var(--danger)", marginBottom: 8 }}>{last.percentage}%</div>
                      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8 }}>{last.examTitle}</div>
                      <div style={{ fontSize: 13 }}>
                        <span style={{ color: "var(--success)" }}>✅ {last.correct}</span>{" "}
                        <span style={{ color: "var(--danger)" }}>❌ {last.wrong}</span>{" "}
                        <span style={{ color: "var(--warning)" }}>⏭ {last.skipped}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{last.completedAt}</div>
                    </div>
                  ) : <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0", fontSize: 13 }}>لم تُكمل أي اختبار بعد</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── SUBJECTS / SECTIONS ── */}
          {tab === "sections" && (
            <div className="page-flip-light">
            {!subscribed ? <SubscriptionGate /> : <>
              {/* If a subject is selected, show its study view */}
              {studySubject ? (
                <div>
                  {/* ── Embed Videos (if any) ──────────────────────── */}
                  {(studySubject.videos?.length ?? 0) > 0 && (
                    <EmbedVideoSection videos={studySubject.videos!} subjectName={studySubject.name} />
                  )}
                  <StudyRoom
                    subject={studySubject}
                    studentEmail={user.email}
                    onBack={() => setStudySubject(null)}
                  />
                </div>
              ) : (
                <>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>📚 موادّي</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
                    المواد المتاحة لك بناءً على: {STAGE_LABELS[user.stage] ?? "—"} · الصف {user.grade ?? "—"} · {TRACK_LABELS[user.track] ?? "—"} · انقر على أي مادة لبدء المذاكرة
                  </p>
                  {mySubjects.length === 0 ? (
                    <div style={{ ...card, textAlign: "center", padding: 60 }}>
                      <div style={{ fontSize: 60, marginBottom: 16 }}>📭</div>
                      <p style={{ color: "var(--text-muted)", fontSize: 15 }}>
                        لا توجد مواد متاحة لمرحلتك الأكاديمية الحالية.<br />
                        تأكد من صحة ملفك الأكاديمي في تبويب "ملفي الشخصي".
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
                      {mySubjects.map(s => {
                        const qCount     = allQuestions.filter(q => q.subjectId === s.id).length;
                        const installInfo = getBundleInstallInfo(s.id);
                        const isDownloading = bundleDownloading === s.id;
                        const prog = isDownloading ? bundleProgress : null;

                        return (
                          <div key={s.id}
                            style={{ ...card, display: "flex", flexDirection: "column", gap: 10, transition: "var(--transition)" }}>

                            {/* ── Clickable study area ── */}
                            <div
                              onClick={() => setStudySubject(s)}
                              style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}
                              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = "0.85"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = "1"; }}>
                              <div style={{ fontSize: 40 }}>{s.icon}</div>
                              <div style={{ fontSize: 16, fontWeight: 800 }}>{s.name}</div>
                              <div style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>{s.description}</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {s.voiceProfileId    && <span className="badge badge-success" style={{ fontSize: 10 }}>🎙 شرح صوتي</span>}
                                {s.curriculumFileName && <span className="badge badge-info"    style={{ fontSize: 10 }}>📄 منهج</span>}
                                {qCount > 0 && <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-muted)", fontSize: 10 }}>{qCount} سؤال</span>}
                                {installInfo && <span className="badge badge-success" style={{ fontSize: 10 }}>📦 مثبّتة</span>}
                              </div>
                              <div style={{ padding: "7px 0", background: "rgba(108,99,255,0.08)", borderRadius: "var(--radius-sm)", textAlign: "center", fontSize: 12, fontWeight: 700, color: "var(--primary)" }}>
                                📖 ابدأ المذاكرة ←
                              </div>
                            </div>

                            {/* ── Bundle download area ── */}
                            <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: 10, marginTop: 2 }}>
                              {isDownloading && prog ? (
                                /* Live progress bar */
                                <div>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                                      {prog.message}
                                    </span>
                                    <span style={{ fontSize: 11, color: "var(--primary)", fontWeight: 700 }}>{prog.pct}%</span>
                                  </div>
                                  <div style={{ height: 6, background: "var(--glass-border)", borderRadius: 4, overflow: "hidden" }}>
                                    <div style={{
                                      height: "100%", borderRadius: 4,
                                      width: `${prog.pct}%`,
                                      background: prog.phase === "done"
                                        ? "var(--success)"
                                        : prog.phase === "error"
                                        ? "var(--danger)"
                                        : "linear-gradient(90deg, var(--primary), var(--secondary))",
                                      transition: "width 0.4s ease",
                                    }} />
                                  </div>
                                </div>
                              ) : bundleProgress?.phase === "done" && bundleDownloading === null ? (
                                /* Success flash (briefly after finish) */
                                <div style={{ fontSize: 12, color: "var(--success)", fontWeight: 700, textAlign: "center", padding: "4px 0" }}>
                                  {bundleProgress.message}
                                </div>
                              ) : (
                                /* Download button */
                                <button
                                  onClick={e => void handleBundleDownload(e, s.id)}
                                  disabled={!!bundleDownloading}
                                  style={{
                                    width: "100%", padding: "9px 0",
                                    background: installInfo
                                      ? "rgba(0,200,150,0.08)"
                                      : "linear-gradient(135deg,rgba(0,200,150,0.15),rgba(0,200,150,0.08))",
                                    border: `1px solid ${installInfo ? "rgba(0,200,150,0.4)" : "rgba(0,200,150,0.3)"}`,
                                    borderRadius: "var(--radius-sm)",
                                    color: installInfo ? "var(--success)" : "var(--success)",
                                    cursor: bundleDownloading ? "not-allowed" : "pointer",
                                    fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                                    opacity: bundleDownloading && !isDownloading ? 0.5 : 1,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                    transition: "all 0.2s",
                                  }}>
                                  {installInfo ? "⬇️ تحديث الحزمة" : "⬇️ تحميل المادة كاملة"}
                                </button>
                              )}
                              {installInfo && !isDownloading && (
                                <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 4 }}>
                                  آخر تثبيت: {new Date(installInfo.installedAt).toLocaleDateString("ar-SA")} · {installInfo.fileCount} ملف
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>}
            </div>
          )}

          {/* ── EXAMS ── */}
          {tab === "exams" && (
            <div className="page-flip">
            {!subscribed ? <SubscriptionGate /> : <>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>📝 الاختبارات</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
                الاختبارات المتاحة لـ {STAGE_LABELS[user.stage] ?? "—"} · الصف {user.grade ?? "—"} · {TRACK_LABELS[user.track] ?? "—"}
              </p>

              {/* ── QuizEngine — full-screen interactive mode ── */}
              {activeExam ? (() => {
                const examQs = activeExam.questionIds
                  .map(qid => allQuestions.find(q => q.id === qid))
                  .filter(Boolean) as Question[];
                return (
                  <div style={{ ...card }}>
                    <QuizEngine
                      exam={activeExam}
                      questions={examQs}
                      onDone={handleExamDone}
                      onExit={() => setActiveExam(null)}
                    />
                  </div>
                );
              })() : null}

              {/* ── Exam list — hidden while quiz is active ── */}
              {!activeExam && myExams.length === 0 ? (
                <div style={{ ...card, textAlign: "center", padding: 60 }}>
                  <div style={{ fontSize: 60, marginBottom: 16 }}>📭</div>
                  <p style={{ color: "var(--text-muted)", fontSize: 15 }}>لا توجد اختبارات منشورة لمرحلتك الأكاديمية حتى الآن</p>
                </div>
              ) : !activeExam ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {myExams.map(e => {
                    const subject = mySubjects.find(s => s.id === e.subjectId);
                    const done = myRecords.filter(r => r.examId === e.id);
                    return (
                      <div key={e.id} style={{ ...card }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
                              {subject?.icon ?? "📝"} {e.title}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{e.description}</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <span className="badge badge-info">⏱ {e.durationMinutes} دقيقة</span>
                              <span className="badge badge-warning">✅ نجاح {e.passingPct}%</span>
                              <span className="badge badge-info">❓ {e.questionIds.length} سؤال</span>
                              {done.length > 0 && <span className="badge badge-success">محاولات: {done.length} · آخر نتيجة: {done[done.length-1]!.percentage}%</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => setActiveExam(e)}
                            style={{ padding: "10px 18px", background: "linear-gradient(135deg,var(--success),#00a07a)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                            ▶ ابدأ
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>}
            </div>
          )}

          {/* ── GRADES ── */}
          {tab === "grades" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📊 نتائجي</h2>
              {myRecords.length === 0 ? (
                <div style={{ ...card, textAlign: "center", padding: 60 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                  <p style={{ color: "var(--text-muted)" }}>لم تُكمل أي اختبار بعد</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto", ...card }}>
                  <table className="data-table">
                    <thead><tr><th>الاختبار</th><th>الدرجة</th><th>النسبة</th><th>✅</th><th>❌</th><th>⏭</th><th>الحالة</th><th>التاريخ</th></tr></thead>
                    <tbody>
                      {myRecords.slice().reverse().map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{r.examTitle}</td>
                          <td><strong style={{ color: "var(--success)" }}>{r.score}/{r.maxScore}</strong></td>
                          <td><span className={`badge ${r.percentage >= 60 ? "badge-success" : "badge-danger"}`}>{r.percentage}%</span></td>
                          <td style={{ color: "var(--success)" }}>{r.correct}</td>
                          <td style={{ color: "var(--danger)" }}>{r.wrong}</td>
                          <td style={{ color: "var(--warning)" }}>{r.skipped}</td>
                          <td><span className={`badge ${r.percentage >= 60 ? "badge-success" : "badge-danger"}`}>{r.percentage >= 60 ? "ناجح" : "راسب"}</span></td>
                          <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{r.completedAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── PRACTICE — بنك الأسئلة للطالب (قراءة وتدريب فقط) ── */}
          {tab === "practice" && (
            <div className="page-flip">
            {!subscribed ? <SubscriptionGate /> : <PracticePanel subjects={mySubjects} allQuestions={allQuestions} card={card} />}
            </div>
          )}

          {/* ── المكتبة والتوأم الرقمي والمساعد الذكي ── */}
          {tab === "media" && (
            <div className="page-flip-light">
            {!subscribed ? <SubscriptionGate /> : <>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>📚 المكتبة والدروس</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
                تصفّح دروس الكتاب منظّمةً بالوحدات • اضغط على الوحدة ثم الدرس لقراءة الملف
              </p>

              <LessonLibrary />

              <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--glass-border)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>🤖 التوأم الرقمي والمساعد الذكي</h3>
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
                  مكتبة محلية مشفّرة • تلاوة صوتية • مساعد ذكي RAG • بحث دلالي — يعمل 100% بدون إنترنت
                </p>
                <OfflineMediaPanel studentEmail={user.email} hideStatus={true} />
              </div>
            </>}
            </div>
          )}

          {/* ── PROFILE ── */}
          {tab === "profile" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>👤 ملفي الشخصي</h2>
              <div style={{ ...card, maxWidth: 520 }}>
                <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
                  <UserAvatar name={user.name} size={64} border="3px solid var(--primary)" />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{user.name}</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{user.email}</div>
                    <span className="badge badge-success" style={{ marginTop: 4 }}>طالب نشط</span>
                  </div>
                </div>

                {/* Static info */}
                {[["المدرسة", user.schoolName], ["تاريخ الانضمام", user.joinedAt]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--glass-border)", fontSize: 14 }}>
                    <span style={{ color: "var(--text-muted)" }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}

                {/* Academic classification */}
                <div style={{ marginTop: 20, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700 }}>🎒 التصنيف الأكاديمي</h4>
                  <button onClick={() => setEditingProfile(e => !e)} style={{ padding: "5px 12px", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", color: "var(--primary)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                    {editingProfile ? "إلغاء" : "✏️ تعديل"}
                  </button>
                </div>

                {editingProfile ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 14, background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-sm)" }}>
                    <div>
                      <label style={label12}>المرحلة الدراسية</label>
                      <select className="form-control" value={profStage} onChange={e => { const s = e.target.value as AcademicStage; setProfStage(s); setProfGrade(GRADES_BY_STAGE[s][0]!); setProfTrack(TRACKS_BY_STAGE[s][0]!); }}>
                        <option value="primary">🏫 ابتدائي</option>
                        <option value="middle">📚 متوسط</option>
                        <option value="secondary">🎓 ثانوي</option>
                      </select>
                    </div>
                    <div>
                      <label style={label12}>الصف الدراسي</label>
                      <select className="form-control" value={profGrade} onChange={e => setProfGrade(Number(e.target.value))}>
                        {GRADES_BY_STAGE[profStage].map(g => <option key={g} value={g}>الصف {g === 1 ? "الأول" : g === 2 ? "الثاني" : g === 3 ? "الثالث" : g === 4 ? "الرابع" : g === 5 ? "الخامس" : "السادس"}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={label12}>المسار / الشعبة</label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {TRACKS_BY_STAGE[profStage].map(t => (
                          <button key={t} type="button" onClick={() => setProfTrack(t)}
                            style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${profTrack === t ? "var(--primary)" : "var(--border)"}`, background: profTrack === t ? "rgba(108,99,255,0.15)" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: profTrack === t ? 700 : 400 }}>
                            {TRACK_ICONS[t]} {TRACK_LABELS[t]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <button onClick={saveProfile} style={{ width: "100%", padding: "10px", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>💾 حفظ التصنيف الأكاديمي</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10, padding: 14, background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-sm)", flexWrap: "wrap" }}>
                    <span className="badge badge-info" style={{ fontSize: 13 }}>{STAGE_ICONS[user.stage] ?? "🏫"} {STAGE_LABELS[user.stage] ?? "—"}</span>
                    <span className="badge badge-warning" style={{ fontSize: 13 }}>الصف {user.grade ?? "—"}</span>
                    <span className="badge badge-success" style={{ fontSize: 13 }}>{TRACK_ICONS[user.track] ?? ""} {TRACK_LABELS[user.track] ?? "—"}</span>
                  </div>
                )}

                <div style={{ marginTop: 16, display: "flex", gap: 14 }}>
                  {[{ icon: "📚", label: "موادّي", val: mySubjects.length, color: "var(--primary)" }, { icon: "📝", label: "محاولاتي", val: myRecords.length, color: "var(--secondary)" }].map(s => (
                    <div key={s.label} style={{ flex: 1, textAlign: "center", padding: 14, background: "var(--bg)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                      <strong style={{ display: "block", fontSize: 22, color: s.color }}>{s.val}</strong>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* ── PERFORMANCE REPORT ── */}
          {tab === "performance" && (
            <div className="page-flip">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>📈 تقرير الأداء</h2>
                <ProgressReportButton
                  student={user}
                  records={myRecords}
                  subjects={mySubjects}
                  attRecs={getAttendanceForStudent(user.id)}
                  subs={getHomeworkSubmissions().filter(s => s.studentId === user.id)}
                  allHW={getHomeworkForStudent(user)}
                  badges={myBadges}
                  points={myPoints}
                />
              </div>
              <PerformanceChart records={myRecords} card={card} />
            </div>
          )}

          {/* ── EXAM CALENDAR ── */}
          {tab === "calendar" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📅 تقويم الاختبارات</h2>
              <ExamCalendar exams={myExams} subjects={mySubjects} card={card} />
            </div>
          )}

          {/* ── GAMIFICATION / ACHIEVEMENTS ── */}
          {tab === "gamification" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>🏆 إنجازاتي وشاراتي</h2>
              <GamificationPanel records={myRecords} card={card} />
            </div>
          )}

          {/* ── HOMEWORK ── */}
          {tab === "homework" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>📋 الواجبات المنزلية</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>واجباتك المُعيَّنة من أساتذتك — سلّم قبل الموعد!</p>
              <HomeworkPanel student={user} card={card} />
            </div>
          )}

          {/* ── LIVE SESSIONS ── */}
          {tab === "sessions" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>📡 الجلسات الدراسية المباشرة</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>انضم إلى جلسات أساتذتك المباشرة عبر Zoom أو Meet</p>
              <LiveSessionViewer student={user} card={card} />
            </div>
          )}

          {/* ── ATTENDANCE ── */}
          {tab === "attendance" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🗓 حضوري وغيابي</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>تابع نسبة حضورك في كل مادة</p>
              <StudentAttendanceView student={user} card={card} />
            </div>
          )}

          {/* ── TIMETABLE ── */}
          {tab === "timetable" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🗃 جدول الحصص الأسبوعي</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>جدول حصصك الأسبوعي — يُحدَّث تلقائياً من قِبَل أساتذتك</p>
              <TimetablePanel role="student" student={user} card={card} />
            </div>
          )}

          {/* ── STUDY NOTES ── */}
          {tab === "notes" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>📓 ملاحظاتي الدراسية</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>دوّن ملاحظاتك لكل مادة — مرتّبة، قابلة للبحث، ومحفوظة على جهازك</p>
              <StudyNotesPanel student={user} subjects={mySubjects} card={card} />
            </div>
          )}

          {/* ── LEADERBOARD ── */}
          {tab === "leaderboard" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🏆 لوحة المتصدرين</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>ترتيبك بين زملائك في نفس الصف بناءً على النقاط المكتسبة</p>
              <Leaderboard student={user} card={card} />
            </div>
          )}

          {/* ── SUPPORT TICKETS ── */}
          {tab === "tickets" && (
            <StudentTicketsPanel student={user} card={card} />
          )}

          {/* ── STORE (المتجر) ── */}
          {tab === "store" && (
            <Storefront student={user} card={card} onGoToTickets={() => setTab("tickets")} />
          )}

          {/* ── TEACHER RATING ── */}
          {tab === "rating" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>⭐ تقييم الأساتذة</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>قيّم أساتذتك بصدق — تقييمك مجهول ويساعدهم على التطور</p>
              <TeacherRatingPanel role="student" student={user} card={card} />
            </div>
          )}

          {/* ── PEER REVIEW ── */}
          {tab === "peerreview" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🤝 تقييم الأقران</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>قيّم إجابات زملائك وتلقّ تقييماتهم لك — تعلّم من بعضكم</p>
              <PeerReviewPanel student={user} card={card} />
            </div>
          )}


          {/* ── DIRECT MESSAGES (replaces old MessageCenter for DM flow) ── */}
          {tab === "messages" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>💬 رسائلي المباشرة</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>تواصل مع أساتذتك مباشرةً</p>
              <DirectMessagePanel role="student" user={user} card={card} />
            </div>
          )}

        </main>
      </div>

      {/* ── Certificate modal — shown automatically after passing an exam ── */}
      {certRecord && (
        <CertificateModal
          record={certRecord}
          student={user}
          subject={certSubject}
          onClose={() => { setCertRecord(null); setCertSubject(undefined); }}
        />
      )}
    </div>
  );
}
