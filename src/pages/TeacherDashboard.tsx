import { useState, useRef } from "react";
import { UserAvatar } from "../components/UserAvatar";
import { GlobalSocialLinks } from "../components/GlobalSocialLinks";
import {
  getStudents, getExamRecords, saveExamRecords,
  getSubjectsForTeacher, getSubjects, saveSubjects,
  getQuestions, saveQuestions, getExams, saveExams,
  storeVideoFile, storeVoiceModel, storeCurriculumFile, getTeachers,
  DIFFICULTY_LABELS, DIFFICULTY_COLORS,
} from "../lib/db";
import type { Teacher, Subject, Question, Exam } from "../lib/db";
import { ProfileSettingsPanel } from "../components/ProfileSettingsPanel";
import { VideoEmbedModal } from "../components/VideoEmbedModal";
import { toast } from "../components/Toast";
import { syncEngine } from "../lib/sync-engine";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { SubjectVideoUpload } from "../components/SubjectVideoUpload";
import { ExamManagementPanel } from "../components/ExamManagementPanel";
import type { ExamFormState } from "../components/ExamManagementPanel";
import { TeacherHomeworkPanel } from "../components/TeacherHomeworkPanel";
import { TeacherStatsPanel } from "../components/TeacherStatsPanel";
import { AnnouncementBanner } from "../components/AnnouncementBanner";
import { LiveSessionPanel } from "../components/LiveSessionPanel";
import { AttendancePanel } from "../components/AttendancePanel";
import { DirectMessagePanel } from "../components/DirectMessagePanel";
import { TimetablePanel } from "../components/TimetablePanel";
import { TeacherRatingPanel } from "../components/TeacherRatingPanel";
import { AudioLessonUploadPanel } from "../components/AudioLessonUploadPanel";
import { AIQuestionGenerator } from "../components/AIQuestionGenerator";
import { ChapterQATeacherPanel } from "../components/ChapterQAPanel";

type Tab = "home" | "subjects" | "questions" | "exams" | "grades" | "profile" | "homework" | "stats" | "sessions" | "attendance" | "dm" | "timetable" | "rating" | "audio" | "ai" | "chapterqa";

interface Props { user: Teacher; onLogout: () => void; }

const AR = ["أ", "ب", "ج", "د"];
const EMPTY_Q = { text: "", optA: "", optB: "", optC: "", optD: "", correctIndex: 0, explanation: "", difficulty: "medium" as Question["difficulty"], points: 5 };
const EMPTY_E = { title: "", description: "", durationMinutes: 30, passingPct: 60, questionIds: [] as string[], status: "draft" as Exam["status"] };

export function TeacherDashboard({ user, onLogout }: Props) {
  const [tab, setTab]               = useState<Tab>("home");
  /* ── Avatar: load from persisted teacher record, update locally ─── */
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | undefined>(
    () => getTeachers().find(t => t.email === user.email)?.avatarUrl,
  );
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [qForm, setQForm]           = useState(EMPTY_Q);
  const [editQId, setEditQId]       = useState<string | null>(null);
  const [eForm, setEForm]           = useState(EMPTY_E);
  const [editEId, setEditEId]       = useState<string | null>(null);
  const [qSearch, setQSearch]       = useState("");
  const [, forceRender]             = useState(0);
  const refresh = () => forceRender(n => n + 1);

  /* ── Subject management view (inline per-subject panel) ─────────── */
  const [subjectView, setSubjectView]       = useState<Subject | null>(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  /* ── Upload state ───────────────────────────────────────────────── */
  const [uploadingVideo, setUploadingVideo] = useState<string | null>(null);
  const [uploadingCurr,  setUploadingCurr]  = useState<string | null>(null);
  const [uploadingVoice, setUploadingVoice] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  /* videoInputRef / pendingVideoSubjId moved into SubjectVideoUpload component */

  const mySubjects  = getSubjectsForTeacher(user);
  const records     = getExamRecords();
  const myStudents  = getStudents().filter(s => s.schoolId === user.schoolId);
  const myQs        = activeSubject ? getQuestions().filter(q => q.subjectId === activeSubject.id && q.teacherId === user.id) : [];
  const myExams     = activeSubject ? getExams().filter(e => e.subjectId === activeSubject.id && e.teacherId === user.id) : [];
  const allMyExams  = getExams().filter(e => e.teacherId === user.id);
  const publishedIds = new Set(allMyExams.filter(e => e.status === "published").map(e => e.id));
  const myResults   = records.filter(r => r.examId && publishedIds.has(r.examId));

  const NAV: { id: Tab; icon: string; label: string }[] = [
    { id: "home",      icon: "🏠",  label: "الرئيسية" },
    { id: "subjects",  icon: "📚",  label: "موادّي" },
    { id: "questions", icon: "❓",  label: "بنك الأسئلة" },
    { id: "exams",     icon: "📝",  label: "الاختبارات" },
    { id: "grades",    icon: "📊",  label: "النتائج" },
    { id: "homework",   icon: "📋",  label: "الواجبات" },
    { id: "sessions",   icon: "📡",  label: "الجلسات المباشرة" },
    { id: "timetable",  icon: "🗃",  label: "جدول الحصص" },
    { id: "attendance", icon: "🗓",  label: "الحضور والغياب" },
    { id: "dm",         icon: "💬",  label: "الرسائل المباشرة" },
    { id: "rating",     icon: "⭐",  label: "تقييماتي من الطلاب" },
    { id: "audio",      icon: "🎙",  label: "الشروحات الصوتية" },
    { id: "ai",         icon: "🤖",  label: "مولّد الأسئلة الذكي" },
    { id: "chapterqa",  icon: "❓",  label: "أسئلة الطلاب" },
    { id: "stats",      icon: "📈",  label: "الإحصاءات" },
    { id: "profile",    icon: "👤",  label: "الملف الشخصي" },
  ];

  const stats = [
    { icon: "📚", label: "موادّي",    value: mySubjects.length,  color: "var(--primary)" },
    { icon: "❓", label: "أسئلتي",    value: getQuestions().filter(q => q.teacherId === user.id).length, color: "var(--success)" },
    { icon: "📝", label: "اختباراتي", value: allMyExams.length,  color: "var(--secondary)" },
    { icon: "👨‍🎓", label: "طلاب المدرسة", value: myStudents.length, color: "var(--warning)" },
  ];

  /* ── Question CRUD ──────────────────────────────────────────────── */
  const saveQ = () => {
    if (!activeSubject) return;
    if (!qForm.text.trim() || !qForm.optA.trim() || !qForm.optB.trim() || !qForm.optC.trim() || !qForm.optD.trim()) {
      toast("يرجى ملء نص السؤال والخيارات الأربعة", "error"); return;
    }
    const options: [string,string,string,string] = [qForm.optA, qForm.optB, qForm.optC, qForm.optD];
    const all = getQuestions();
    if (editQId) {
      const idx = all.findIndex(q => q.id === editQId);
      if (idx !== -1) all[idx] = { ...all[idx]!, text: qForm.text, options, correctIndex: qForm.correctIndex, explanation: qForm.explanation, difficulty: qForm.difficulty, points: qForm.points };
      saveQuestions(all);
      /* Push updated question to cloud so students can pull it */
      if (idx !== -1) void syncEngine.pushQuestion(all[idx]!);
      toast("تم تحديث السؤال ✅", "success");
    } else {
      const q: Question = {
        id: `q_${Date.now()}`, subjectId: activeSubject.id, teacherId: user.id,
        text: qForm.text, options, correctIndex: qForm.correctIndex, explanation: qForm.explanation,
        difficulty: qForm.difficulty, points: qForm.points, createdAt: new Date().toLocaleDateString("ar-SA"),
      };
      all.push(q); saveQuestions(all);
      /* Push new question to cloud so students can pull it */
      void syncEngine.pushQuestion(q);
      toast("تم إضافة السؤال ✅", "success");
    }
    setQForm(EMPTY_Q); setEditQId(null); refresh();
  };

  const startEditQ = (q: Question) => {
    setQForm({ text: q.text, optA: q.options[0], optB: q.options[1], optC: q.options[2], optD: q.options[3], correctIndex: q.correctIndex, explanation: q.explanation, difficulty: q.difficulty, points: q.points });
    setEditQId(q.id);
  };

  const deleteQ = (id: string) => {
    if (!confirm("حذف هذا السؤال؟")) return;
    saveQuestions(getQuestions().filter(q => q.id !== id));
    toast("تم الحذف", "warning"); refresh();
  };

  /* ── Exam CRUD ──────────────────────────────────────────────────── */
  const saveE = () => {
    if (!activeSubject) return;
    if (!eForm.title.trim()) { toast("عنوان الاختبار مطلوب", "error"); return; }
    if (eForm.questionIds.length === 0) { toast("يرجى إضافة أسئلة للاختبار", "error"); return; }
    const all = getExams();
    if (editEId) {
      const idx = all.findIndex(e => e.id === editEId);
      if (idx !== -1) all[idx] = { ...all[idx]!, ...eForm };
      saveExams(all);
      /* Push updated exam to cloud so students can pull it */
      if (idx !== -1) void syncEngine.pushExam(all[idx]!);
      toast("تم تحديث الاختبار ✅", "success");
    } else {
      const e: Exam = {
        id: `exam_${Date.now()}`, subjectId: activeSubject.id, teacherId: user.id,
        title: eForm.title, description: eForm.description, questionIds: eForm.questionIds,
        durationMinutes: eForm.durationMinutes, passingPct: eForm.passingPct,
        stage: activeSubject.stage, grade: activeSubject.grade,
        track: activeSubject.track === "all" ? "all" : activeSubject.track,
        /* Inherit subject's scope: platform-wide subjects → "all"; school-specific → teacher's school */
        schoolId: activeSubject.schoolId === "all" ? "all" : user.schoolId,
        status: "draft", createdAt: new Date().toLocaleDateString("ar-SA"),
      };
      all.push(e); saveExams(all);
      /* Push new exam to cloud (as draft; students only see published ones) */
      void syncEngine.pushExam(e);
      toast("تم إنشاء الاختبار ✅", "success");
    }
    setEForm(EMPTY_E); setEditEId(null); refresh();
  };

  const togglePublish = (id: string) => {
    const all = getExams();
    const e = all.find(x => x.id === id); if (!e) return;
    e.status = e.status === "published" ? "draft" : "published";
    saveExams(all);
    /* Push updated exam status to cloud */
    void syncEngine.pushExam(e);
    /* When publishing, also push all linked questions so students have them */
    if (e.status === "published") {
      const linkedQs = getQuestions().filter(q => e.questionIds.includes(q.id));
      linkedQs.forEach(q => void syncEngine.pushQuestion(q));
    }
    toast(e.status === "published" ? "تم نشر الاختبار 🎉" : "تم إلغاء النشر", e.status === "published" ? "success" : "warning");
    refresh();
  };

  const deleteE = (id: string) => {
    if (!confirm("حذف هذا الاختبار؟")) return;
    saveExams(getExams().filter(e => e.id !== id));
    toast("تم الحذف", "warning"); refresh();
  };

  const toggleQInExam = (qId: string) => {
    setEForm(f => ({
      ...f,
      questionIds: f.questionIds.includes(qId) ? f.questionIds.filter(id => id !== qId) : [...f.questionIds, qId],
    }));
  };

  const filteredQs = myQs.filter(q => !qSearch || q.text.includes(qSearch));

  /* ── Video upload handler (teacher role only) ───────────────────── */
  const clearProgress = (key: string) =>
    setTimeout(() => setUploadProgress(p => { const n = { ...p }; delete n[key]; return n; }), 3000);

  const uploadVideo = async (subjId: string, file: File) => {
    const pKey = `video_${subjId}`;
    setUploadingVideo(subjId);
    setUploadProgress(p => ({ ...p, [pKey]: 0 }));
    try {
      const buf = await file.arrayBuffer();
      setUploadProgress(p => ({ ...p, [pKey]: 80 }));
      await storeVideoFile(subjId, buf, file.name, file.type);
      setUploadProgress(p => ({ ...p, [pKey]: 100 }));
      const all = getSubjects();
      const s = all.find(x => x.id === subjId);
      if (s) { s.videoFileId = `video_${subjId}`; s.videoFileName = file.name; }
      saveSubjects(all);
      toast(`✅ تم رفع فيديو "${file.name}" بنجاح`, "success");
      refresh();
      if (subjectView?.id === subjId) setSubjectView(all.find(x => x.id === subjId) ?? null);
    } catch {
      toast("⚠️ حدث خطأ أثناء رفع الفيديو", "error");
    } finally {
      setUploadingVideo(null);
      clearProgress(pKey);
    }
  };

  /* ── Curriculum PDF upload (teacher) ───────────────────────────── */
  const uploadCurriculum = async (subjId: string, file: File) => {
    const pKey = `curr_${subjId}`;
    setUploadingCurr(subjId);
    setUploadProgress(p => ({ ...p, [pKey]: 0 }));
    try {
      const buf = await file.arrayBuffer();
      setUploadProgress(p => ({ ...p, [pKey]: 60 }));
      await storeCurriculumFile(subjId, buf, file.name, file.type);
      setUploadProgress(p => ({ ...p, [pKey]: 100 }));
      const all = getSubjects();
      const s = all.find(x => x.id === subjId);
      if (s) { s.curriculumFileId = `curriculum_${subjId}`; s.curriculumFileName = file.name; }
      saveSubjects(all);
      void syncEngine.pushSubject(all.find(x => x.id === subjId)!);
      toast(`✅ تم رفع المنهج "${file.name}" بنجاح`, "success");
      refresh();
      if (subjectView?.id === subjId) setSubjectView(all.find(x => x.id === subjId) ?? null);
    } catch {
      toast("⚠️ حدث خطأ أثناء رفع ملف المنهج", "error");
    } finally {
      setUploadingCurr(null);
      clearProgress(pKey);
    }
  };

  /* ── Voice profile upload (teacher) ────────────────────────────── */
  const uploadVoice = async (subjId: string, file: File) => {
    const pKey = `voice_${subjId}`;
    setUploadingVoice(subjId);
    setUploadProgress(p => ({ ...p, [pKey]: 0 }));
    try {
      const buf = await file.arrayBuffer();
      setUploadProgress(p => ({ ...p, [pKey]: 60 }));
      await storeVoiceModel(subjId, buf, file.name);
      setUploadProgress(p => ({ ...p, [pKey]: 100 }));
      const all = getSubjects();
      const s = all.find(x => x.id === subjId);
      if (s) { s.voiceProfileId = `voice_${subjId}`; }
      saveSubjects(all);
      void syncEngine.pushSubject(all.find(x => x.id === subjId)!);
      toast(`✅ تم رفع الصوت التعريفي بنجاح`, "success");
      refresh();
      if (subjectView?.id === subjId) setSubjectView(all.find(x => x.id === subjId) ?? null);
    } catch {
      toast("⚠️ حدث خطأ أثناء رفع الملف الصوتي", "error");
    } finally {
      setUploadingVoice(null);
      clearProgress(pKey);
    }
  };

  /* ── Shared styles ─────────────────────────────────────────────── */
  const card = { background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 20 } as const;
  const label12 = { display: "block" as const, fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 as const };

  return (
    <div>
      <nav className="main-nav">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 28 }}>👨‍🏫</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, background: "linear-gradient(135deg, var(--primary), var(--secondary))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>لوحة الأستاذ</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{user.spec}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <UserAvatar name={user.name} src={localAvatarUrl} size={36} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</span>
          <LanguageSwitcher compact />
          <button onClick={onLogout} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>خروج</button>
        </div>
      </nav>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, padding: "24px", maxWidth: 1400, margin: "0 auto" }} className="two-col">
        <aside className="sidebar" style={{ height: "fit-content" }}>
          {NAV.map(n => (
            <button key={n.id} className={`menu-link ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
          {activeSubject && (
            <div style={{ marginTop: 16, padding: 12, background: "rgba(108,99,255,0.1)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>المادة النشطة:</div>
              <div style={{ color: "var(--primary)" }}>{activeSubject.icon} {activeSubject.name}</div>
            </div>
          )}
          <GlobalSocialLinks compact />
        </aside>

        <main>
          {/* ── HOME ── */}
          {tab === "home" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>مرحباً، <span style={{ color: "var(--primary)" }}>أ. {user.name}</span> 👋</h2>
              <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>{user.spec} — {user.schoolName}</p>
              <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 28 }}>
                {stats.map(s => (
                  <div key={s.label} className="stat-card">
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{s.icon}</div>
                    <div><div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.value}</div><div style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.label}</div></div>
                  </div>
                ))}
              </div>
              {mySubjects.length === 0 ? (
                <div style={{ ...card, textAlign: "center", padding: 40 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
                  <p style={{ color: "var(--text-muted)" }}>لم يتم تعيين أي مواد لك بعد. تواصل مع مدير النظام.</p>
                </div>
              ) : (
                <div style={card}>
                  <h4 style={{ marginBottom: 14, fontSize: 15, fontWeight: 700 }}>📚 موادّك المعيّنة</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
                    {mySubjects.map(s => (
                      <div key={s.id} style={{ padding: 14, background: "rgba(108,99,255,0.07)", borderRadius: "var(--radius-sm)", border: "1px solid var(--glass-border)", cursor: "pointer" }}
                        onClick={() => { setSubjectView(s); setTab("subjects"); }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>{s.icon}</div>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>الصف {s.grade} — {s.stage}</div>
                        {s.videoFileId ? <span style={{ fontSize: 10, color: "var(--success)" }}>🎬 فيديو ✅</span> : <span style={{ fontSize: 10, color: "#FFA500" }}>🎬 بدون فيديو</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SUBJECTS ── */}
          {tab === "subjects" && (
            <>
            <div className="page-flip-light">

              {/* ── Subject management panel (drill-in view) ── */}
              {subjectView ? (
                <div>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBlockEnd: 24 }}>
                    <button
                      onClick={() => setSubjectView(null)}
                      style={{ padding: "7px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                      ← رجوع
                    </button>
                    <div style={{ fontSize: 32 }}>{subjectView.icon}</div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{subjectView.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {subjectView.stage === "primary" ? "ابتدائي" : subjectView.stage === "middle" ? "متوسط" : "ثانوي"} · الصف {subjectView.grade}
                      </div>
                    </div>
                  </div>

                  {/* ── SubjectVideoUpload component ── */}
                  <SubjectVideoUpload
                    subject={subjectView}
                    uploadingVideo={uploadingVideo}
                    uploadingCurr={uploadingCurr}
                    uploadingVoice={uploadingVoice}
                    uploadProgress={uploadProgress}
                    userRole="teacher"
                    onUpload={uploadVideo}
                    onUploadCurriculum={uploadCurriculum}
                    onUploadVoice={uploadVoice}
                    onGoToQuestions={() => { setActiveSubject(subjectView); setTab("questions"); }}
                    onGoToExams={() => { setActiveSubject(subjectView); setTab("exams"); }}
                  />

                  {/* ── Embed Video Lessons ── */}
                  <div style={{ ...card, marginTop: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: "var(--primary)" }}>
                        🎬 دروس الفيديو المضمّنة ({subjectView.videos?.length ?? 0})
                      </h3>
                      <button
                        onClick={() => setVideoModalOpen(true)}
                        style={{
                          padding: "8px 16px", background: "var(--primary)", border: "none",
                          borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer",
                          fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        ➕ إضافة درس مرئي
                      </button>
                    </div>

                    {!subjectView.videos?.length ? (
                      <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "16px 0" }}>
                        لا توجد دروس مرئية بعد — اضغط "إضافة درس مرئي" لإضافة أول درس
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {subjectView.videos.map((v, idx) => (
                          <div key={v.id} style={{
                            padding: "12px 14px", background: "var(--bg)",
                            borderRadius: "var(--radius-sm)", border: "1px solid var(--glass-border)",
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                                  🎬 {idx + 1}. {v.title}
                                </div>
                                {v.description && (
                                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{v.description}</div>
                                )}
                                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                  أضيف بواسطة {v.addedBy} · {new Date(v.addedAt).toLocaleDateString("ar-EG")}
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  if (!confirm(`حذف درس "${v.title}"؟`)) return;
                                  const all = getSubjects();
                                  const updated = all.map(s =>
                                    s.id === subjectView.id
                                      ? { ...s, videos: (s.videos ?? []).filter(x => x.id !== v.id) }
                                      : s,
                                  );
                                  saveSubjects(updated);
                                  setSubjectView(updated.find(s => s.id === subjectView.id) ?? null);
                                  toast("تم حذف الدرس", "warning");
                                }}
                                style={{
                                  padding: "5px 10px", background: "rgba(255,71,87,0.1)",
                                  border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)",
                                  color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700,
                                  flexShrink: 0, marginInlineStart: 10,
                                }}
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              ) : (
                /* ── Subject list grid ── */
                <>
                  <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📚 موادّي المعيّنة</h2>
                  {mySubjects.length === 0 ? (
                    <div style={{ ...card, textAlign: "center", padding: 40 }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                      <p style={{ color: "var(--text-muted)" }}>لا توجد مواد معيّنة لك حتى الآن</p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
                      {mySubjects.map(s => {
                        const isUploading = uploadingVideo === s.id;
                        const pct = uploadProgress[`video_${s.id}`];
                        return (
                          <div key={s.id}
                            style={{ ...card, cursor: "pointer", border: "1px solid var(--glass-border)", transition: "var(--transition)" }}
                            onClick={() => setSubjectView(s)}>
                            <div style={{ fontSize: 36, marginBottom: 10 }}>{s.icon}</div>
                            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{s.name}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{s.description}</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                              <span className="badge badge-info">ص{s.grade}</span>
                              <span className="badge badge-warning">{s.stage === "primary" ? "ابتدائي" : s.stage === "middle" ? "متوسط" : "ثانوي"}</span>
                              {s.voiceProfileId && <span className="badge badge-success">🎙 صوت</span>}
                              {s.curriculumFileId && <span className="badge badge-success">📄 منهج</span>}
                              {s.videoFileId
                                ? <span className="badge badge-success">🎬 فيديو ✅</span>
                                : <span className="badge" style={{ background: "rgba(255,165,0,0.12)", color: "#FFA500" }}>🎬 بدون فيديو</span>}
                            </div>
                            {/* Inline upload progress on card */}
                            {isUploading && pct !== undefined && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ height: 4, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: "var(--primary)", transition: "width 0.3s" }} />
                                </div>
                              </div>
                            )}
                            <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "7px 0", background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-sm)", marginTop: 4 }}>
                              🔧 إدارة المادة ←
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Video embed modal (outside the ternary, inside the tab fragment) ── */}
            {videoModalOpen && subjectView && (
              <VideoEmbedModal
                subject={subjectView}
                addedBy={user.name}
                onClose={() => setVideoModalOpen(false)}
                onSaved={updated => { setSubjectView(updated); setVideoModalOpen(false); }}
              />
            )}
            </>
          )}

          {/* ── QUESTIONS ── */}
          {tab === "questions" && (
            <div className="page-flip">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>❓ بنك الأسئلة {activeSubject ? `— ${activeSubject.icon} ${activeSubject.name}` : ""}</h2>
                {!activeSubject && <span style={{ fontSize: 13, color: "var(--warning)" }}>اختر مادة من "موادّي" أولاً</span>}
              </div>

              {/* Subject picker */}
              {mySubjects.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <select className="form-control" value={activeSubject?.id ?? ""} onChange={e => setActiveSubject(mySubjects.find(s => s.id === e.target.value) ?? null)}>
                    <option value="">— اختر المادة —</option>
                    {mySubjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                  </select>
                </div>
              )}

              {activeSubject && (
                <>
                  {/* Question form */}
                  <div style={{ ...card, marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{editQId ? "✏️ تعديل السؤال" : "➕ إضافة سؤال جديد"}</h4>
                    <div style={{ marginBottom: 12 }}>
                      <label style={label12}>نص السؤال *</label>
                      <textarea className="form-control" rows={2} value={qForm.text} onChange={e => setQForm(f => ({ ...f, text: e.target.value }))} placeholder="اكتب نص السؤال هنا..." style={{ resize: "vertical" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                      {(["optA","optB","optC","optD"] as const).map((k, i) => (
                        <div key={k}>
                          <label style={label12}>{AR[i]} — الخيار {i+1} {qForm.correctIndex === i ? "✅" : ""}</label>
                          <div style={{ display: "flex", gap: 6 }}>
                            <input className="form-control" value={qForm[k]} onChange={e => setQForm(f => ({ ...f, [k]: e.target.value }))} placeholder={`الخيار ${AR[i]}`} style={{ flex: 1 }} />
                            <button type="button" onClick={() => setQForm(f => ({ ...f, correctIndex: i }))}
                              style={{ padding: "0 10px", borderRadius: "var(--radius-sm)", border: `2px solid ${qForm.correctIndex === i ? "var(--success)" : "var(--border)"}`, background: qForm.correctIndex === i ? "rgba(0,200,150,0.15)" : "transparent", cursor: "pointer", fontSize: 14 }}>
                              ✓
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 10, marginBottom: 12 }}>
                      <div>
                        <label style={label12}>مستوى الصعوبة</label>
                        <select className="form-control" value={qForm.difficulty} onChange={e => setQForm(f => ({ ...f, difficulty: e.target.value as Question["difficulty"] }))}>
                          <option value="easy">سهل</option><option value="medium">متوسط</option><option value="hard">صعب</option>
                        </select>
                      </div>
                      <div>
                        <label style={label12}>الشرح (اختياري)</label>
                        <input className="form-control" value={qForm.explanation} onChange={e => setQForm(f => ({ ...f, explanation: e.target.value }))} placeholder="شرح الإجابة الصحيحة" />
                      </div>
                      <div>
                        <label style={label12}>الدرجة</label>
                        <input type="number" className="form-control" value={qForm.points} min={1} max={20} onChange={e => setQForm(f => ({ ...f, points: Number(e.target.value) }))} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveQ} style={{ padding: "9px 20px", background: "var(--primary)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                        {editQId ? "💾 حفظ التعديل" : "➕ إضافة السؤال"}
                      </button>
                      {editQId && <button onClick={() => { setQForm(EMPTY_Q); setEditQId(null); }} style={{ padding: "9px 16px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>إلغاء</button>}
                    </div>
                  </div>

                  {/* Question list */}
                  <div style={{ marginBottom: 12 }}>
                    <input className="form-control" value={qSearch} onChange={e => setQSearch(e.target.value)} placeholder="🔍 ابحث في الأسئلة..." />
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>{filteredQs.length} سؤال</div>
                  {filteredQs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>لا توجد أسئلة بعد — أضف أول سؤال أعلاه</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {filteredQs.map((q, i) => (
                        <div key={q.id} style={{ ...card, padding: 16 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                            <p style={{ fontWeight: 600, lineHeight: 1.6, flex: 1 }}>{i+1}. {q.text}</p>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <span className="badge" style={{ background: DIFFICULTY_COLORS[q.difficulty] + "22", color: DIFFICULTY_COLORS[q.difficulty] }}>{DIFFICULTY_LABELS[q.difficulty]}</span>
                              <span className="badge badge-info">{q.points} نقطة</span>
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                            {q.options.map((opt, oi) => (
                              <div key={oi} style={{ padding: "7px 10px", borderRadius: 6, background: q.correctIndex === oi ? "rgba(0,200,150,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${q.correctIndex === oi ? "var(--success)" : "var(--border)"}`, fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ width: 18, height: 18, borderRadius: "50%", background: q.correctIndex === oi ? "var(--success)" : "var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{AR[oi]}</span>
                                {opt}
                                {q.correctIndex === oi && <span style={{ marginRight: "auto", color: "var(--success)" }}>✅</span>}
                              </div>
                            ))}
                          </div>
                          {q.explanation && <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, padding: "6px 10px", background: "rgba(108,99,255,0.06)", borderRadius: 6 }}>💡 {q.explanation}</p>}
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => startEditQ(q)} style={{ padding: "6px 14px", background: "rgba(108,99,255,0.1)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", color: "var(--primary)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✏️ تعديل</button>
                            <button onClick={() => deleteQ(q.id)} style={{ padding: "6px 14px", background: "rgba(255,71,87,0.08)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>🗑 حذف</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── EXAMS ── */}
          {tab === "exams" && (
            <ExamManagementPanel
              userRole="teacher"
              mySubjects={mySubjects}
              activeSubject={activeSubject}
              myQs={myQs}
              myExams={myExams}
              eForm={eForm}
              editEId={editEId}
              onSubjectChange={s => setActiveSubject(s)}
              onFormChange={patch => setEForm((f: ExamFormState) => ({ ...f, ...patch }))}
              onSave={saveE}
              onCancelEdit={() => { setEForm(EMPTY_E); setEditEId(null); }}
              onDelete={deleteE}
              onTogglePublish={togglePublish}
              onStartEdit={e => {
                setEditEId(e.id);
                setEForm({
                  title:           e.title,
                  description:     e.description,
                  durationMinutes: e.durationMinutes,
                  passingPct:      e.passingPct,
                  questionIds:     [...e.questionIds],
                  status:          e.status,
                });
              }}
              onToggleQ={toggleQInExam}
            />
          )}

          {/* ── GRADES ── */}
          {tab === "grades" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📊 نتائج الطلاب</h2>
              {myResults.length === 0 ? (
                <div style={{ ...card, textAlign: "center", padding: 40 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                  <p style={{ color: "var(--text-muted)" }}>لا توجد نتائج للاختبارات المنشورة بعد</p>
                </div>
              ) : (
                <div style={{ ...card, overflowX: "auto" }}>
                  <table className="data-table">
                    <thead><tr><th>الطالب</th><th>الاختبار</th><th>الدرجة</th><th>النسبة</th><th>الحالة</th><th>التاريخ</th></tr></thead>
                    <tbody>
                      {myResults.slice().reverse().map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 13 }}>{r.studentEmail}</td>
                          <td style={{ fontSize: 13 }}>{r.examTitle}</td>
                          <td><strong style={{ color: "var(--success)" }}>{r.score}/{r.maxScore}</strong></td>
                          <td><span className={`badge ${r.percentage >= 60 ? "badge-success" : "badge-danger"}`}>{r.percentage}%</span></td>
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

          {/* ── HOMEWORK ── */}
          {tab === "homework" && (
            <div className="page-flip">
              <AnnouncementBanner />
              <TeacherHomeworkPanel teacher={user} mySubjects={mySubjects} card={card} />
            </div>
          )}

          {/* ── TIMETABLE ── */}
          {tab === "timetable" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🗃 جدول الحصص الأسبوعي</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>أضف حصصك للجدول — يظهر تلقائياً لطلابك</p>
              <TimetablePanel role="teacher" teacher={user} mySubjects={mySubjects} card={card} />
            </div>
          )}

          {/* ── TEACHER RATINGS ── */}
          {tab === "rating" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>⭐ تقييماتي من الطلاب</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>تقييمات طلابك — مجهولة ومصنّفة حسب جوانب التدريس</p>
              <TeacherRatingPanel role="teacher" teacher={user} card={card} />
            </div>
          )}

          {/* ── LIVE SESSIONS ── */}
          {tab === "sessions" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>📡 الجلسات الدراسية المباشرة</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>أنشئ جلسات Zoom أو Meet وشاركها تلقائياً مع طلابك</p>
              <LiveSessionPanel teacher={user} mySubjects={mySubjects} card={card} />
            </div>
          )}

          {/* ── ATTENDANCE ── */}
          {tab === "attendance" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🗓 الحضور والغياب</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>سجّل حضور وغياب طلابك لكل مادة وتاريخ</p>
              <AttendancePanel teacher={user} mySubjects={mySubjects} card={card} />
            </div>
          )}

          {/* ── DIRECT MESSAGES ── */}
          {tab === "dm" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>💬 الرسائل المباشرة</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>تواصل مباشر مع طلابك</p>
              <DirectMessagePanel role="teacher" user={user} card={card} />
            </div>
          )}

          {/* ── AUDIO LESSONS ── */}
          {tab === "audio" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🎙 الشروحات الصوتية</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>ارفع تسجيلات صوتية لشرح الدروس — تُحفظ على جهاز الطالب وتعمل بدون إنترنت</p>
              <AudioLessonUploadPanel teacher={user} card={card} />
            </div>
          )}

          {/* ── AI QUESTION GENERATOR ── */}
          {tab === "ai" && (
            <div className="page-flip">
              <AIQuestionGenerator teacher={user} subjects={mySubjects} onAdded={() => setTab("questions")} card={card} />
            </div>
          )}

          {/* ── CHAPTER Q&A ── */}
          {tab === "chapterqa" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>❓ أسئلة الطلاب على الفصول</h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>
                أجب على أسئلة طلابك لكل فصل في موادك المعيّنة
              </p>
              {mySubjects.length === 0 ? (
                <div style={{ ...card, textAlign: "center", padding: 40, color: "var(--text-muted)" }}>لا توجد مواد معيّنة لك بعد</div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <select className="form-control" value={activeSubject?.id ?? ""} onChange={e => setActiveSubject(mySubjects.find(s => s.id === e.target.value) ?? null)} style={{ marginBottom: 20 }}>
                    <option value="">— اختر المادة —</option>
                    {mySubjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                  </select>
                  {activeSubject && (
                    <ChapterQATeacherPanel subjectId={activeSubject.id} subjectName={activeSubject.name} teacher={user} card={card} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STATS ── */}
          {tab === "stats" && (
            <div className="page-flip">
              <AnnouncementBanner />
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>📈 إحصاءاتي</h2>
              <TeacherStatsPanel teacher={user} mySubjects={mySubjects} myExams={allMyExams} card={card} />
            </div>
          )}

          {/* ── PROFILE ── */}
          {tab === "profile" && (
            <div className="page-flip">
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>👤 الملف الشخصي</h2>
              <div style={{ ...card, maxWidth: 500 }}>
                <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
                  <UserAvatar name={user.name} src={localAvatarUrl} size={64} border="3px solid var(--primary)" />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{user.name}</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{user.email}</div>
                    <span className="badge badge-success" style={{ marginTop: 4 }}>أستاذ نشط</span>
                  </div>
                </div>
                {[
                  ["التخصص", user.spec], ["المدرسة", user.schoolName],
                  ["تاريخ الانضمام", user.joinedAt],
                  ["المواد المعيّنة", mySubjects.map(s => s.name).join("، ") || "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--glass-border)", fontSize: 14 }}>
                    <span style={{ color: "var(--text-muted)" }}>{k}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* ── Avatar upload panel ── */}
              <ProfileSettingsPanel
                teacherEmail={user.email}
                name={user.name}
                initialAvatarUrl={localAvatarUrl}
                onAvatarChange={url => setLocalAvatarUrl(url || undefined)}
                card={card}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
