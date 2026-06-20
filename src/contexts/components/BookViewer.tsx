/**
 * BookViewer — قارئ الكتاب الرقمي التفاعلي
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a subject as a unified "digital book" containing:
 *   - Overview tab: cover + install info + download button
 *   - PDF tab: curriculum file from IndexedDB (blob URL → iframe)
 *   - Video tab: video file from IndexedDB (blob URL → <video>)
 *   - Study tab: launches existing StudyRoom for AI-assisted study
 *
 * Content is always served from IndexedDB (offline-first). If not installed,
 * the user is prompted to download the bundle first.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useMemo } from "react";
import type { Subject } from "@/lib/db";
import { loadCurriculumFile, loadVideoFile, getStudents } from "@/lib/db";
import { StudyRoom } from "./StudyRoom";
import { BookTextReader } from "./BookTextReader";
import { AudioLessonPlayer } from "./AudioLessonPlayer";
import { ChapterProgressTracker } from "./ChapterProgressTracker";
import { ChapterQAStudentPanel } from "./ChapterQAPanel";
import { VideoNotesPanel } from "./VideoNotesPanel";
import {
  downloadAndInstallBundle,
  getBundleInstallInfo,
  type BundleProgress,
} from "@/lib/bundle-manager";
import { toast } from "./Toast";

/* ── Props ─────────────────────────────────────────────────────────────────── */

export interface BookViewerProps {
  subject:      Subject;
  studentEmail: string;
  onClose:      () => void;
}

/* ── Tab types ─────────────────────────────────────────────────────────────── */

type BookTab = "overview" | "read" | "pdf" | "video" | "study" | "audio" | "progress" | "qa" | "notes";

/* ══════════════════════════════════════════════════════════════════════════ */

export function BookViewer({ subject, studentEmail, onClose }: BookViewerProps) {
  const [tab, setTab]           = useState<BookTab>("overview");
  const [pdfUrl, setPdfUrl]     = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hasPdf, setHasPdf]     = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [qaChapter, setQaChapter] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);

  /* Bundle download */
  const [bundleDownloading, setBundleDownloading] = useState(false);
  const [bundleProgress,    setBundleProgress]    = useState<BundleProgress | null>(null);

  /* Student lookup from email */
  const student = useMemo(() => getStudents().find(s => s.email === studentEmail), [studentEmail]);

  const installInfo = getBundleInstallInfo(subject.id);

  /* Refs track live blob URLs so both effects can revoke before replacing */
  const pdfBlobRef   = useRef<string | null>(null);
  const videoBlobRef = useRef<string | null>(null);

  /* ── Load blobs from IndexedDB ───────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const pdfResult   = await loadCurriculumFile(subject.id);
      const videoResult = await loadVideoFile(subject.id);

      if (pdfResult) {
        if (pdfBlobRef.current) URL.revokeObjectURL(pdfBlobRef.current);
        const blob = new Blob([pdfResult.data], { type: pdfResult.meta["type"] ?? "application/pdf" });
        const url  = URL.createObjectURL(blob);
        pdfBlobRef.current = url;
        setPdfUrl(url);
        setHasPdf(true);
      }
      if (videoResult) {
        if (videoBlobRef.current) URL.revokeObjectURL(videoBlobRef.current);
        const blob = new Blob([videoResult.data], { type: videoResult.meta["type"] ?? "video/mp4" });
        const url  = URL.createObjectURL(blob);
        videoBlobRef.current = url;
        setVideoUrl(url);
        setHasVideo(true);
      }

      setLoading(false);
    };

    void load();

    return () => {
      if (pdfBlobRef.current)   { URL.revokeObjectURL(pdfBlobRef.current);   pdfBlobRef.current   = null; }
      if (videoBlobRef.current) { URL.revokeObjectURL(videoBlobRef.current); videoBlobRef.current = null; }
    };
  }, [subject.id]);

  /* ── Re-load after bundle install ───────────────────────────────────── */
  useEffect(() => {
    const handler = () => {
      void (async () => {
        const pdfR   = await loadCurriculumFile(subject.id);
        const videoR = await loadVideoFile(subject.id);
        if (pdfR && !hasPdf) {
          if (pdfBlobRef.current) URL.revokeObjectURL(pdfBlobRef.current);
          const url = URL.createObjectURL(new Blob([pdfR.data], { type: pdfR.meta["type"] ?? "application/pdf" }));
          pdfBlobRef.current = url;
          setPdfUrl(url);
          setHasPdf(true);
        }
        if (videoR && !hasVideo) {
          if (videoBlobRef.current) URL.revokeObjectURL(videoBlobRef.current);
          const url = URL.createObjectURL(new Blob([videoR.data], { type: videoR.meta["type"] ?? "video/mp4" }));
          videoBlobRef.current = url;
          setVideoUrl(url);
          setHasVideo(true);
        }
      })();
    };
    window.addEventListener("ome-assets-updated", handler);
    return () => window.removeEventListener("ome-assets-updated", handler);
  }, [subject.id, hasPdf, hasVideo]);

  /* ── Bundle download handler ─────────────────────────────────────────── */
  const handleDownload = async () => {
    if (bundleDownloading) return;
    if (!navigator.onLine) {
      toast("يجب الاتصال بالإنترنت لتحميل الكتاب", "warning");
      return;
    }
    setBundleDownloading(true);
    setBundleProgress(null);
    try {
      await downloadAndInstallBundle(subject.id, p => setBundleProgress({ ...p }));
      toast(`✅ تم تحميل كتاب ${subject.name} بنجاح`, "success");
    } catch (err) {
      toast(`⚠️ ${err instanceof Error ? err.message : "فشل التحميل"}`, "warning");
    } finally {
      setBundleDownloading(false);
      setTimeout(() => setBundleProgress(null), 3000);
    }
  };

  /* ── Study tab: delegate to StudyRoom ───────────────────────────────── */
  if (tab === "study") {
    return (
      <StudyRoom
        subject={subject}
        studentEmail={studentEmail}
        onBack={() => setTab("overview")}
      />
    );
  }

  /* ── Tab definitions ─────────────────────────────────────────────────── */
  const TABS: { id: BookTab; icon: string; label: string }[] = [
    { id: "overview",  icon: "📖", label: "نظرة عامة" },
    { id: "read",      icon: "📚", label: "قراءة نصية" },
    ...(hasPdf   ? [{ id: "pdf"   as BookTab, icon: "📄", label: "الشرح" }]   : []),
    ...(hasVideo ? [{ id: "video" as BookTab, icon: "🎬", label: "الفيديو" }] : []),
    { id: "audio",    icon: "🎧", label: "الشرح الصوتي" },
    ...(student ? [
      { id: "progress" as BookTab, icon: "📌", label: "تقدم القراءة" },
      { id: "qa"       as BookTab, icon: "❓", label: "اسأل المدرس" },
      ...(hasVideo ? [{ id: "notes" as BookTab, icon: "📝", label: "ملاحظات الفيديو" }] : []),
    ] : []),
    { id: "study", icon: "🤖", label: "المذاكرة التفاعلية" },
  ];

  const cardStyle = {
    background: "var(--card)",
    border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius)",
    padding: 20,
  } as const;

  /* ══════════════════════════════════════════════════════════════════════ */

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          onClick={onClose}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
          ← المكتبة
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{subject.icon} {subject.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject.description}</div>
        </div>
        {installInfo && (
          <span className="badge badge-success" style={{ fontSize: 11, flexShrink: 0 }}>
            📦 الكتاب مثبّت · {installInfo.fileCount} ملف
          </span>
        )}
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--glass-border)", paddingBottom: 12, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: tab === t.id ? "rgba(108,99,255,0.12)" : "transparent", border: tab === t.id ? "1px solid var(--primary)" : "1px solid transparent", borderRadius: "var(--radius-sm)", color: tab === t.id ? "var(--primary)" : "var(--text-muted)", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, fontFamily: "inherit", transition: "all 0.2s" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="fade-in">
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, marginBottom: 20 }}>

            {/* Book cover */}
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "linear-gradient(145deg, rgba(108,99,255,0.18), rgba(108,99,255,0.06))", border: "1px solid rgba(108,99,255,0.25)", minHeight: 220, padding: 32 }}>
              <div style={{ fontSize: 72 }}>{subject.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900, textAlign: "center", lineHeight: 1.3 }}>{subject.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
                {hasPdf   && <span className="badge badge-info"    style={{ fontSize: 10 }}>📄 منهج</span>}
                {hasVideo && <span className="badge badge-success" style={{ fontSize: 10 }}>🎬 فيديو</span>}
                {subject.voiceProfileId && <span className="badge badge-success" style={{ fontSize: 10 }}>🎙 صوت</span>}
              </div>
            </div>

            {/* Info panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📋 عن هذا الكتاب</div>
                <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.9, margin: 0 }}>{subject.description}</p>
              </div>

              {loading ? (
                <div style={{ ...cardStyle, textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 28 }}>
                  ⏳ جارٍ فحص المحتوى المحمّل…
                </div>
              ) : (hasPdf || hasVideo) ? (
                <div style={{ ...cardStyle, background: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.25)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--success)" }}>✅ المحتوى المتاح للقراءة الآن</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {hasPdf   && <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><span>📄</span> ملف الشرح والمنهج الدراسي</div>}
                    {hasVideo && <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><span>🎬</span> الفيديو التوضيحي</div>}
                  </div>
                  {installInfo && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--glass-border)" }}>آخر تحديث: {new Date(installInfo.installedAt).toLocaleDateString("ar-SA")}</div>}
                </div>
              ) : (
                <div style={{ ...cardStyle, background: "rgba(255,165,0,0.06)", border: "1px solid rgba(255,165,0,0.25)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--warning)" }}>📭 الكتاب غير محمّل على جهازك</div>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.8 }}>حمّل الكتاب مرة واحدة للوصول إليه دائماً بدون إنترنت.</p>
                </div>
              )}
            </div>
          </div>

          {/* Download / progress */}
          {bundleDownloading && bundleProgress ? (
            <div style={{ ...cardStyle, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{bundleProgress.message}</span>
                <span style={{ fontSize: 13, color: "var(--primary)", fontWeight: 700 }}>{bundleProgress.pct}%</span>
              </div>
              <div style={{ height: 10, background: "var(--glass-border)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 5, width: `${bundleProgress.pct}%`, background: bundleProgress.phase === "done" ? "var(--success)" : "linear-gradient(90deg, var(--primary), var(--secondary))", transition: "width 0.35s ease" }} />
              </div>
            </div>
          ) : (
            <button
              onClick={() => void handleDownload()}
              disabled={bundleDownloading || !navigator.onLine}
              style={{ width: "100%", padding: "16px 28px", background: installInfo ? "rgba(0,200,150,0.08)" : "linear-gradient(135deg, var(--success), #00a07a)", border: installInfo ? "2px solid rgba(0,200,150,0.4)" : "none", borderRadius: "var(--radius-sm)", color: installInfo ? "var(--success)" : "#fff", fontSize: 16, fontWeight: 700, cursor: (bundleDownloading || !navigator.onLine) ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16, opacity: !navigator.onLine ? 0.5 : 1 }}>
              ⬇️ {installInfo ? `تحديث كتاب ${subject.name}` : `تحميل كتاب ${subject.name} كاملاً`}
            </button>
          )}

          {/* Quick launch buttons */}
          {(hasPdf || hasVideo) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
              {hasPdf && (
                <button onClick={() => setTab("pdf")}
                  style={{ padding: "12px 0", background: "rgba(108,99,255,0.08)", border: "1px solid var(--primary)", borderRadius: "var(--radius-sm)", color: "var(--primary)", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                  📄 اقرأ الشرح
                </button>
              )}
              {hasVideo && (
                <button onClick={() => setTab("video")}
                  style={{ padding: "12px 0", background: "rgba(0,200,150,0.08)", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", color: "var(--success)", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                  🎬 شاهد الفيديو
                </button>
              )}
              <button onClick={() => setTab("study")}
                style={{ padding: "12px 0", background: "linear-gradient(135deg, var(--primary), var(--secondary))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                🤖 ابدأ المذاكرة
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TEXT READER ────────────────────────────────────────────────── */}
      {tab === "read" && (
        <div className="fade-in">
          <BookTextReader
            subject={subject.name}
            subjectIcon={subject.icon}
            card={cardStyle}
          />
        </div>
      )}

      {/* ── AUDIO PLAYER ───────────────────────────────────────────────── */}
      {tab === "audio" && (
        <div className="fade-in">
          <AudioLessonPlayer
            subjectId={subject.id}
            subjectName={subject.name}
            subjectIcon={subject.icon}
            card={cardStyle}
          />
        </div>
      )}

      {/* ── PDF VIEWER ─────────────────────────────────────────────────── */}
      {tab === "pdf" && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              title={`شرح ${subject.name}`}
              style={{ width: "100%", minHeight: "70vh", border: "none", borderRadius: "var(--radius)" }}
            />
          ) : (
            <div style={{ ...cardStyle, textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>ملف الشرح غير محمّل.</p>
              <button onClick={() => setTab("overview")} style={{ marginTop: 16, padding: "10px 24px", background: "var(--primary)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
                ⬇️ حمّل الكتاب أولاً
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── VIDEO PLAYER ───────────────────────────────────────────────── */}
      {tab === "video" && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {videoUrl ? (
            <video
              ref={videoRef}
              controls
              src={videoUrl}
              onLoadedMetadata={e => setVideoDuration((e.target as HTMLVideoElement).duration)}
              style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: "var(--radius)", background: "#000", width: "100%" }}
            />
          ) : (
            <div style={{ ...cardStyle, textAlign: "center", padding: 60, width: "100%" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>الفيديو غير محمّل.</p>
              <button onClick={() => setTab("overview")} style={{ marginTop: 16, padding: "10px 24px", background: "var(--primary)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
                ⬇️ حمّل الكتاب أولاً
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── CHAPTER PROGRESS TRACKER ───────────────────────────────────────── */}
      {tab === "progress" && student && (
        <div className="fade-in">
          <ChapterProgressTracker
            subjectId={subject.id}
            subjectName={subject.name}
            student={student}
            card={cardStyle}
            onSelectChapter={idx => {
              setQaChapter(idx);
              setTab("qa");
            }}
          />
        </div>
      )}

      {/* ── CHAPTER Q&A ────────────────────────────────────────────────────── */}
      {tab === "qa" && student && (
        <div className="fade-in">
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>الفصل:</label>
            <select
              value={qaChapter}
              onChange={e => setQaChapter(Number(e.target.value))}
              style={{ padding: "6px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontFamily: "inherit", fontSize: 13 }}
            >
              {Array.from({ length: 5 }, (_, i) => (
                <option key={i} value={i}>الفصل {i + 1}</option>
              ))}
            </select>
          </div>
          <ChapterQAStudentPanel
            subjectId={subject.id}
            subjectName={subject.name}
            chapterIndex={qaChapter}
            student={student}
            card={cardStyle}
          />
        </div>
      )}

      {/* ── VIDEO NOTES ────────────────────────────────────────────────────── */}
      {tab === "notes" && student && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {videoUrl && (
            <video
              ref={videoRef}
              controls
              src={videoUrl}
              onLoadedMetadata={e => setVideoDuration((e.target as HTMLVideoElement).duration)}
              style={{ maxWidth: "100%", maxHeight: "50vh", borderRadius: "var(--radius)", background: "#000", width: "100%" }}
            />
          )}
          <VideoNotesPanel
            subjectId={subject.id}
            student={student}
            videoRef={videoRef}
            duration={videoDuration}
            card={cardStyle}
          />
        </div>
      )}
    </div>
  );
}

