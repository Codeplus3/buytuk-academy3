/**
 * StudyRoom — غرفة المذاكرة التفاعلية
 * ─────────────────────────────────────────────────────────────────────────────
 * Split-screen learning environment combining:
 *   LEFT  (60%) — VideoPlayerWithCapture: AI Visual Tutor (VLM + STT + TTS)
 *   RIGHT (40%) — Curriculum panel: PDF viewer from IDB + AI text tutor chat
 *
 * Responsive: side-by-side on tablet/desktop, stacked on mobile.
 * RTL/LTR: driven by LanguageContext (useLanguage hook).
 * Data: curriculum PDF + voice profile loaded from IndexedDB on mount.
 *
 * Integration points:
 *   • VideoPlayerWithCapture → analyzeFrame(frame, question) → TTS answer
 *   • OfflineMediaEngine.createTutor() → text chat with RAG
 *   • loadCurriculumFile(subjectId) → Blob URL for PDF iframe
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  useState, useEffect, useRef, useCallback,
} from "react";
import type { RefObject } from "react";
import { VideoPlayerWithCapture }
  from "./VideoPlayerWithCapture";
import { loadCurriculumFile, loadVideoFile }
  from "@/lib/db";
import type { Subject }
  from "@/lib/db";
import { OfflineMediaEngine }
  from "@/lib/offline-media-engine";
import type { TutorMessage }
  from "@/lib/offline-media-engine";
import type { AITutor }
  from "@/lib/offline-media-engine/ai-tutor";
import { useLanguage }
  from "@/contexts/LanguageContext";
import { extractFramesAndEmbeddings }
  from "@/lib/video-analyzer";
import type { VideoAnalysisProgress }
  from "@/lib/video-analyzer";

/* ── Shared singleton engine ──────────────────────────────────────────── */

const engine = OfflineMediaEngine.getInstance();

/* ── Props ────────────────────────────────────────────────────────────── */

export interface StudyRoomProps {
  subject:      Subject;
  studentEmail: string;
  onBack:       () => void;
}

/* ── Right panel tabs ─────────────────────────────────────────────────── */

type RightTab = "pdf" | "chat";

/* ── Fullscreen helpers ───────────────────────────────────────────────── */

function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFull, setIsFull] = useState(false);

  const toggle = useCallback(async () => {
    if (!ref.current) return;
    if (!document.fullscreenElement) {
      await ref.current.requestFullscreen().catch(() => {/* denied */});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }, [ref]);

  useEffect(() => {
    const handler = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return { isFull, toggle };
}

/* ══════════════════════════════════════════════════════════════════════════
   StudyRoom
══════════════════════════════════════════════════════════════════════════ */

export function StudyRoom({ subject, studentEmail, onBack }: StudyRoomProps) {
  const { lang, dir, isRTL } = useLanguage();
  const isAr = lang === "ar";

  const roomRef = useRef<HTMLDivElement>(null);
  const { isFull, toggle: toggleFullscreen } = useFullscreen(roomRef);

  /* ── Video state ──────────────────────────────────────────────────── */
  const [videoSrc,     setVideoSrc]     = useState<string | null>(null);
  const [videoName,    setVideoName]    = useState("");
  const [videoLoading, setVideoLoading] = useState(true);
  const videoUrlRef = useRef<string | null>(null);

  /* ── PDF state ────────────────────────────────────────────────────── */
  const [pdfUrl,  setPdfUrl]  = useState<string | null>(null);
  const [pdfName, setPdfName] = useState("");
  const pdfUrlRef = useRef<string | null>(null);

  /* ── Right panel tab ──────────────────────────────────────────────── */
  const [rightTab, setRightTab] = useState<RightTab>(subject.curriculumFileId ? "pdf" : "chat");

  /* ── Video analysis (RAG context from video) ─────────────────────── */
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysisProgress | null>(null);

  /* ── Chat state ───────────────────────────────────────────────────── */
  const [messages,    setMessages]    = useState<TutorMessage[]>([]);
  const [chatInput,   setChatInput]   = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const tutorRef  = useRef<AITutor | null>(null);
  const chatRef   = useRef<HTMLDivElement>(null);

  /* ── Load PDF from IDB ──────────────────────────────────────────── */
  useEffect(() => {
    if (!subject.curriculumFileId) return;
    loadCurriculumFile(subject.curriculumFileId).then(asset => {
      if (!asset) return;
      const mime = asset.meta["type"] || "application/pdf";
      const blob = new Blob([asset.data], { type: mime });
      const url  = URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfName(asset.meta["name"] || (isAr ? "المنهج" : "Curriculum"));
      pdfUrlRef.current = url;
    }).catch(() => { /* no curriculum */ });
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, [subject.curriculumFileId, isAr]);

  /* ── Load video from IDB automatically (teacher-uploaded) ───────── */
  useEffect(() => {
    setVideoLoading(true);
    loadVideoFile(subject.id).then(asset => {
      if (!asset) { setVideoLoading(false); return; }
      const mime = asset.meta["type"] || "video/mp4";
      const blob = new Blob([asset.data], { type: mime });
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      const url = URL.createObjectURL(blob);
      videoUrlRef.current = url;
      setVideoSrc(url);
      setVideoName(asset.meta["name"] || (isAr ? "الدرس" : "Lesson"));
      setVideoLoading(false);
    }).catch(() => { setVideoLoading(false); });
  }, [subject.id, isAr]);

  /* ── Video analysis — build RAG context so AI can "see" the video ── */
  useEffect(() => {
    if (!videoSrc) return;
    let cancelled = false;

    setVideoAnalysis({ phase: "loading", pct: 0, message: isAr ? "جاري تحليل الدرس…" : "Analysing lesson…" });

    extractFramesAndEmbeddings(
      videoSrc,
      subject.id,
      subject.name,
      (p) => { if (!cancelled) setVideoAnalysis(p); },
    ).then(async () => {
      if (cancelled) return;
      /* Rebuild shared search index so AITutor can find video chunks */
      await engine.rebuildSearchIndex();
      if (!cancelled) {
        setVideoAnalysis({
          phase:   "done",
          pct:     100,
          message: isAr ? "تم تحليل الفيديو ✅" : "Video analysed ✅",
        });
      }
    }).catch(() => {
      if (!cancelled) {
        setVideoAnalysis({
          phase:   "error",
          pct:     0,
          message: isAr ? "تعذّر تحليل الفيديو" : "Video analysis failed",
        });
      }
    });

    return () => { cancelled = true; };
  }, [videoSrc, subject.id, subject.name, isAr]);

  /* ── Init engine + tutor ────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await engine.init();
      if (cancelled) return;
      const t = engine.createTutor(studentEmail, subject.name);
      await t.init();
      if (cancelled) return;
      tutorRef.current = t;
      const greeting = await t.chat(`مرحباً، أريد المذاكرة في مادة ${subject.name}`);
      if (!cancelled) {
        setMessages([greeting]);
        setEngineReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [subject.name, studentEmail]);

  /* ── Auto-scroll chat ─────────────────────────────────────────── */
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  /* ── Clean up video object URL ─────────────────────────────────── */
  useEffect(() => {
    return () => { if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current); };
  }, []);

  /* ── Send chat message ──────────────────────────────────────────── */
  const sendMessage = useCallback(async () => {
    if (!chatInput.trim() || !tutorRef.current || chatLoading) return;
    const q = chatInput.trim();
    setChatInput("");
    setMessages(m => [...m, { role: "user" as const, content: q, timestamp: Date.now() }]);
    setChatLoading(true);
    try {
      const reply = await tutorRef.current.chat(q);
      setMessages(m => [...m, reply]);
      await engine.saveTutorSession(tutorRef.current!.getSession());
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading]);

  /* ── Quick chat suggestions ─────────────────────────────────────── */
  const QUICK = isAr
    ? [`اشرح لي الدرس الأول`, `ما أهم المفاهيم؟`, `ساعدني في المراجعة`]
    : [`Explain lesson 1`, `Key concepts?`, `Help me review`];

  /* ── CSS variable colours (match app theme) ─────────────────────── */
  const V = {
    card:    "var(--card)",
    border:  "var(--glass-border)",
    radius:  "var(--radius)",
    radiusSm:"var(--radius-sm)",
    primary: "var(--primary)",
    muted:   "var(--text-muted)",
    success: "var(--success)",
    info:    "var(--info)",
    bg:      "var(--bg)",
  } as const;

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div
      ref={roomRef}
      dir={dir}
      className="study-room"
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        isFull ? "100vh" : "auto",
        background:    V.bg,
        borderRadius:  V.radius,
        overflow:      "hidden",
      }}
    >
      {/* ══ TOOLBAR ══════════════════════════════════════════════════ */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:            12,
        padding:        "10px 16px",
        background:     V.card,
        borderBottom:   `1px solid ${V.border}`,
        flexShrink:     0,
        flexWrap:       "wrap",
        position:       isFull ? "sticky" : "relative",
        top:            isFull ? 0 : "auto",
        zIndex:         10,
      }}>
        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            display:      "flex", alignItems: "center", gap: 5,
            padding:      "7px 14px",
            background:   "transparent",
            border:       `1px solid ${V.border}`,
            borderRadius: V.radiusSm,
            cursor:       "pointer",
            color:        V.muted,
            fontFamily:   "inherit",
            fontSize:     13,
            flexShrink:   0,
          }}
        >
          {isRTL ? "→ رجوع" : "← Back"}
        </button>

        {/* Subject info */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>{subject.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {(isAr ? subject.name_ar : subject.name_en) ?? subject.name}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
              {subject.voiceProfileId   && <span className="badge badge-success" style={{ fontSize: 10 }}>🎙 {isAr ? "شرح صوتي" : "Voice"}</span>}
              {subject.curriculumFileId && <span className="badge badge-info"    style={{ fontSize: 10 }}>📄 {pdfName || (isAr ? "منهج" : "PDF")}</span>}
              {videoSrc && (
                <span className="badge" style={{ background: "rgba(108,99,255,0.15)", color: V.primary, fontSize: 10 }}>
                  🎬 {videoName || (isAr ? "الدرس" : "Lesson")}
                </span>
              )}
              {/* Video analysis status indicator */}
              {videoAnalysis && videoAnalysis.phase !== "done" && videoAnalysis.phase !== "error" && (
                <span
                  className="badge"
                  title={videoAnalysis.message}
                  style={{
                    background:  "rgba(255,170,0,0.15)",
                    color:       "#c87f00",
                    fontSize:    10,
                    animation:   "pulse 1.5s ease-in-out infinite",
                    display:     "flex",
                    alignItems:  "center",
                    gap:         4,
                  }}
                >
                  <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span>
                  {isAr ? "جاري تحليل الدرس…" : "Analysing…"}
                  {videoAnalysis.pct > 0 && ` ${videoAnalysis.pct}%`}
                </span>
              )}
              {videoAnalysis?.phase === "done" && (
                <span className="badge badge-success" style={{ fontSize: 10 }}>
                  🔍 {isAr ? "فيديو محلَّل" : "Video analysed"}
                </span>
              )}
              {videoAnalysis?.phase === "error" && (
                <span
                  className="badge"
                  title={videoAnalysis.message}
                  style={{ background: "rgba(200,50,50,0.15)", color: "#c83232", fontSize: 10 }}
                >
                  ⚠️ {isAr ? "لم يتم التحليل" : "Analysis failed"}
                </span>
              )}
              <span className="badge" style={{ background: "rgba(0,0,0,0.15)", color: V.muted, fontSize: 10 }}>
                📴 {isAr ? "محلي 100%" : "100% offline"}
              </span>
            </div>
          </div>
        </div>

        {/* Fullscreen toggle */}
        <button
          onClick={() => void toggleFullscreen()}
          title={isFull ? (isAr ? "إلغاء تكبير الشاشة" : "Exit fullscreen") : (isAr ? "تكبير الشاشة" : "Fullscreen")}
          style={{
            padding:      "7px 10px",
            background:   "transparent",
            border:       `1px solid ${V.border}`,
            borderRadius: V.radiusSm,
            cursor:       "pointer",
            color:        V.muted,
            fontSize:     16,
            lineHeight:   1,
            flexShrink:   0,
          }}
        >
          {isFull ? "⊡" : "⛶"}
        </button>
      </div>

      {/* ══ MAIN CONTENT ═════════════════════════════════════════════ */}
      <div
        className="study-room-body"
        style={{
          display:   "grid",
          gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)",
          gap:       0,
          flex:      1,
          minHeight: 0,
          overflow:  isFull ? "hidden" : "visible",
        }}
      >

        {/* ╔══ LEFT PANEL: Video + AI Visual Tutor ═══════════════════╗ */}
        <div style={{
          display:        "flex",
          flexDirection:  "column",
          borderInlineEnd:`1px solid ${V.border}`,
          background:     "#08060f",
          overflow:       "hidden",
        }}>

          {/* Panel header */}
          <div style={{
            padding:        "9px 14px",
            borderBottom:   `1px solid rgba(255,255,255,0.07)`,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            flexShrink:     0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 14 }}>🎬</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>
                {isAr ? "مشغّل الدرس — اسأل الأستاذ الذكي" : "Lesson Player — Ask AI Tutor"}
              </span>
            </div>
            {/* Video status badge */}
            {videoLoading ? (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span>
                {isAr ? "جارٍ تحميل الفيديو…" : "Loading video…"}
              </span>
            ) : videoSrc ? (
              <span style={{ fontSize: 11, color: "var(--success)", display: "flex", alignItems: "center", gap: 5 }}>
                ✅ {videoName || (isAr ? "الفيديو جاهز" : "Video ready")}
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "rgba(255,165,0,0.7)", display: "flex", alignItems: "center", gap: 5 }}>
                ⚠️ {isAr ? "لم يُرفع فيديو بعد" : "No video uploaded yet"}
              </span>
            )}
          </div>

          {/* Video area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 }}>
            {videoSrc ? (
              <div style={{ width: "100%", height: "100%", overflow: "auto" }}>
                <VideoPlayerWithCapture
                  src={videoSrc}
                  subject={subject.name}
                  language={isAr ? "ar" : "en"}
                  sessionId={`student_${studentEmail}_${subject.id}`}
                  onAnswer={(answer, frame) => {
                    /* Log to chat as a message for history */
                    setMessages(prev => [
                      ...prev,
                      {
                        role:      "user"      as const,
                        content:   `[🎬 ${isAr ? "سؤال بصري" : "Visual question"}] — ${frame.videoTime.toFixed(1)}s`,
                        timestamp: Date.now() - 100,
                      },
                      {
                        role:      "assistant" as const,
                        content:   answer,
                        timestamp: Date.now(),
                      },
                    ]);
                  }}
                />
              </div>
            ) : videoLoading ? (
              /* Loading state — fetching teacher's video */
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 20, padding: 60, flex: 1,
              }}>
                <div style={{ fontSize: 56, animation: "spin 2s linear infinite", lineHeight: 1 }}>🎬</div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 17, fontWeight: 800, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>
                    {isAr ? "جاري تحميل درس الفيديو…" : "Loading lesson video…"}
                  </p>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.7, maxWidth: 280 }}>
                    {isAr
                      ? "يتم جلب الفيديو الذي رفعه الأستاذ تلقائياً من قاعدة البيانات."
                      : "Fetching the video uploaded by your teacher automatically."}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: "var(--primary)",
                      animation: `blink 1.2s ease-in-out ${i * 0.3}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            ) : (
              /* No video uploaded by teacher yet */
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 16, padding: 60, flex: 1,
              }}>
                <div style={{ fontSize: 56, lineHeight: 1, opacity: 0.4 }}>📭</div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
                    {isAr ? "لم يُرفع فيديو لهذه المادة بعد" : "No video uploaded for this subject yet"}
                  </p>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: 1.7, maxWidth: 280 }}>
                    {isAr
                      ? "تواصل مع أستاذك ليقوم برفع فيديو الدرس من لوحة التحكم."
                      : "Contact your teacher to upload the lesson video from the dashboard."}
                  </p>
                </div>
                {/* Still show capabilities */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 340, marginTop: 8 }}>
                  {[
                    { icon: "🔍", ar: "تحليل بصري بالذكاء",    en: "AI visual analysis" },
                    { icon: "🎙", ar: "أسئلة صوتية Hands-Free", en: "Hands-free voice questions" },
                    { icon: "🔊", ar: "إجابة بصوت الأستاذ",     en: "Teacher voice answers" },
                  ].map(f => (
                    <span key={f.icon} style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 12px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 20, fontSize: 11,
                      color: "rgba(255,255,255,0.35)",
                    }}>
                      {f.icon} {isAr ? f.ar : f.en}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ╔══ RIGHT PANEL: Curriculum + AI Tutor ════════════════════╗ */}
        <div style={{
          display:       "flex",
          flexDirection: "column",
          background:    V.card,
          overflow:      "hidden",
        }}>

          {/* Tab bar */}
          <div style={{
            display:      "flex",
            gap:          0,
            borderBottom: `1px solid ${V.border}`,
            flexShrink:   0,
          }}>
            {([
              pdfUrl && { id: "pdf"  as RightTab, icon: "📄", ar: pdfName || "المنهج",        en: pdfName || "Curriculum" },
                         { id: "chat" as RightTab, icon: "🤖", ar: `مساعد ${subject.name}`, en: `${subject.name} Tutor` },
            ] as const).filter(Boolean).map(t => t && (
              <button
                key={t.id}
                onClick={() => setRightTab(t.id)}
                style={{
                  flex:         1,
                  padding:      "11px 10px",
                  background:   rightTab === t.id ? "rgba(108,99,255,0.1)" : "transparent",
                  border:       "none",
                  borderBottom: rightTab === t.id ? `2px solid ${V.primary}` : "2px solid transparent",
                  cursor:       "pointer",
                  color:        rightTab === t.id ? V.primary : V.muted,
                  fontFamily:   "inherit",
                  fontSize:     12,
                  fontWeight:   rightTab === t.id ? 700 : 400,
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  gap:          5,
                  transition:   "all 0.15s",
                  whiteSpace:   "nowrap",
                }}
              >
                {t.icon} {isAr ? t.ar : t.en}
              </button>
            ))}
          </div>

          {/* ── PDF Viewer ─────────────────────────────────────────── */}
          {rightTab === "pdf" && pdfUrl && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{
                padding:      "7px 14px",
                background:   "rgba(0,150,255,0.06)",
                borderBottom: `1px solid ${V.border}`,
                display:      "flex",
                alignItems:   "center",
                gap:          8,
                fontSize:     12,
                flexShrink:   0,
              }}>
                <span>📄</span>
                <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pdfName}</span>
                <span className="badge badge-info" style={{ fontSize: 10, marginInlineStart: "auto" }}>
                  📴 {isAr ? "محلي" : "Local"}
                </span>
              </div>
              <iframe
                src={pdfUrl}
                title={pdfName}
                style={{ flex: 1, border: "none", display: "block", width: "100%" }}
              />
            </div>
          )}

          {/* ── AI Tutor Chat ───────────────────────────────────────── */}
          {rightTab === "chat" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Messages area */}
              <div
                ref={chatRef}
                style={{
                  flex:          1,
                  overflowY:     "auto",
                  padding:       "14px 14px 0",
                  display:       "flex",
                  flexDirection: "column",
                  gap:           10,
                }}
              >
                {messages.length === 0 && !engineReady && (
                  <div style={{ textAlign: "center", color: V.muted, paddingTop: 40, fontSize: 12 }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🤖</div>
                    <div style={{
                      width: 28, height: 28,
                      border: `3px solid rgba(108,99,255,0.15)`,
                      borderTopColor: V.primary,
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      margin: "10px auto 0",
                    }} />
                    <p style={{ marginTop: 8 }}>{isAr ? "جارٍ تهيئة المساعد…" : "Initializing tutor…"}</p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      display:       "flex",
                      justifyContent: msg.role === "user" ? "flex-start" : "flex-end",
                    }}
                  >
                    <div style={{
                      maxWidth:   "88%",
                      padding:    "9px 13px",
                      borderRadius: msg.role === "user" ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
                      background: msg.role === "user"
                        ? "rgba(108,99,255,0.12)"
                        : "rgba(0,200,150,0.10)",
                      border: `1px solid ${msg.role === "user"
                        ? "rgba(108,99,255,0.25)"
                        : "rgba(0,200,150,0.25)"}`,
                      fontSize:   12.5,
                      lineHeight: 1.75,
                      whiteSpace: "pre-wrap",
                      wordBreak:  "break-word",
                    }}>
                      {msg.role === "assistant" && (
                        <div style={{ fontSize: 10, color: V.muted, marginBottom: 3 }}>
                          🤖 {isAr ? subject.name : subject.name}
                        </div>
                      )}
                      {msg.content}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{
                      padding:    "8px 13px",
                      background: "rgba(0,200,150,0.08)",
                      border:     "1px solid rgba(0,200,150,0.2)",
                      borderRadius: "14px 14px 4px 14px",
                      fontSize:   11,
                      color:      V.muted,
                      display:    "flex",
                      alignItems: "center",
                      gap:        7,
                    }}>
                      <span style={{
                        display:      "inline-block",
                        width:        12, height: 12,
                        border:       "2px solid rgba(0,200,150,0.3)",
                        borderTopColor: "var(--success)",
                        borderRadius: "50%",
                        animation:    "spin 0.8s linear infinite",
                      }} />
                      {isAr ? "جارٍ التفكير…" : "Thinking…"}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick suggestions */}
              <div style={{ padding: "8px 14px 0", display: "flex", gap: 5, flexWrap: "wrap" }}>
                {QUICK.map(q => (
                  <button
                    key={q}
                    onClick={() => setChatInput(q)}
                    style={{
                      padding:      "3px 10px",
                      background:   "rgba(108,99,255,0.06)",
                      border:       "1px solid rgba(108,99,255,0.15)",
                      borderRadius: 20,
                      cursor:       "pointer",
                      fontSize:     10,
                      color:        V.primary,
                      fontFamily:   "inherit",
                      transition:   "all 0.15s",
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Input row */}
              <div style={{ padding: "10px 14px 14px", display: "flex", gap: 7 }}>
                <input
                  className="form-control"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && void sendMessage()}
                  placeholder={isAr ? `اسأل عن ${subject.name}…` : `Ask about ${subject.name}…`}
                  dir={dir}
                  style={{ flex: 1, fontSize: 12.5, padding: "9px 13px" }}
                />
                <button
                  onClick={() => void sendMessage()}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{
                    padding:      "9px 16px",
                    background:   "linear-gradient(135deg,var(--primary),var(--primary-dark,#5848e0))",
                    border:       "none",
                    borderRadius: V.radiusSm,
                    color:        "#fff",
                    cursor:       "pointer",
                    fontFamily:   "inherit",
                    fontWeight:   700,
                    fontSize:     15,
                    opacity:      chatLoading || !chatInput.trim() ? 0.45 : 1,
                    transition:   "opacity 0.2s",
                  }}
                >
                  {isRTL ? "↩" : "↑"}
                </button>
              </div>

              {/* Footer note */}
              <div style={{
                padding:      "0 14px 10px",
                fontSize:     10,
                color:        V.muted,
                textAlign:    "center",
                borderTop:    `1px solid ${V.border}`,
                paddingTop:   8,
              }}>
                🤖 RAG {isAr ? "محلي • بدون إنترنت • IndexedDB" : "local • offline • IndexedDB"}
                {subject.voiceProfileId && ` • 🎙 ${isAr ? "صوت الأستاذ متاح" : "Teacher voice ready"}`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ Responsive styles ════════════════════════════════════════ */}
      <style>{`
        @media (max-width: 768px) {
          .study-room-body {
            grid-template-columns: 1fr !important;
          }
          .study-room-body > div:first-child {
            min-height: 320px;
            border-inline-end: none !important;
            border-bottom: 1px solid var(--glass-border);
          }
          .study-room-body > div:last-child {
            min-height: 420px;
          }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .study-room-body {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

export default StudyRoom;

