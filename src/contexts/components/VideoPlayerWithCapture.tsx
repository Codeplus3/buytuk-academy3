/**
 * VideoPlayerWithCapture — Video Digital Twin Engine UI
 * ─────────────────────────────────────────────────────────────────────────────
 * State machine:
 *   idle → cta → input → recording → transcribing → analyzing → speaking → done
 *
 *  idle          Video playing — no overlay
 *  cta           Paused — "اسأل الأستاذ" CTA button
 *  input         Mini dialog — text field + mic button
 *  recording     Mic active — animated waveform, tap to stop
 *  transcribing  STT processing — "جاري التحويل…"
 *  analyzing     Worker + RAG processing — rotating phrases
 *  speaking      Answer streaming + TTS auto-playing
 *  done          Answer shown — ask again or resume
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useRef, useState, useCallback, useEffect, useLayoutEffect,
} from "react";
import {
  captureVideoFrame, type VisionFrame,
} from "@/lib/offline-media-engine/skeleton/local-vision-engine";
import {
  LocalSTTEngine,
  type STTBackendType,
} from "@/lib/offline-media-engine/skeleton/local-stt-engine";
import { getWorkerBridge }
  from "@/lib/offline-media-engine/concrete/worker-bridge";

/* ── Phase ────────────────────────────────────────────────────────────── */

type Phase =
  | "idle"
  | "cta"
  | "input"
  | "recording"
  | "transcribing"
  | "analyzing"
  | "speaking"
  | "done";

/* ── Props ────────────────────────────────────────────────────────────── */

export interface VideoPlayerWithCaptureProps {
  src:        string;
  poster?:    string;
  subject?:   string;
  language?:  "ar" | "en";
  onAnswer?:  (answer: string, frame: VisionFrame) => void;
  sessionId?: string;
}

/* ── STT hook ─────────────────────────────────────────────────────────── */

function useSTTEngine(language: "ar" | "en") {
  const engineRef   = useRef<LocalSTTEngine | null>(null);
  const [ready,     setReady]      = useState(false);
  const [backend,   setBackend]    = useState<STTBackendType | null>(null);

  /* Initialise engine once */
  useEffect(() => {
    const engine = new LocalSTTEngine({ language, maxDurationMs: 20_000 });
    engineRef.current = engine;
    engine.init().then(status => {
      setBackend(status.backend);
      setReady(true);
    }).catch(() => { /* mic permission denied or no API — handled gracefully */ });
    return () => { engine.dispose(); };
  }, [language]);

  const startSTT = useCallback(async () => {
    const e = engineRef.current;
    if (!e || !e.isReady) return;
    if (e.backend === "browser-api") {
      /* Browser API doesn't use MediaRecorder — it starts listening immediately */
      return; /* transcribeFromMic() is called in stopSTT */
    }
    await e.startRecording();
  }, []);

  const stopAndTranscribe = useCallback(async (): Promise<string> => {
    const e = engineRef.current;
    if (!e || !e.isReady) return "";
    if (e.backend === "browser-api") {
      const result = await e.transcribeFromMic();
      return result.text;
    }
    const result = await e.stopAndTranscribe();
    return result.text;
  }, []);

  const cancelSTT = useCallback(() => {
    engineRef.current?.cancelRecording();
  }, []);

  return { ready, backend, startSTT, stopAndTranscribe, cancelSTT };
}

/* ── Rotating loading phrases ─────────────────────────────────────────── */

const PHRASES: Record<"ar" | "en", string[]> = {
  ar: ["الأستاذ يقرأ الصورة…", "جاري تحليل المحتوى…", "يُعِدّ الإجابة…", "البحث في قاعدة المعرفة…", "يصوغ الشرح…"],
  en: ["Tutor is reading the frame…", "Analyzing the content…", "Preparing an answer…", "Searching knowledge base…", "Composing explanation…"],
};

function useRotatingPhrase(lang: "ar" | "en", active: boolean): string {
  const list = PHRASES[lang];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) { setIdx(0); return; }
    const t = setInterval(() => setIdx(i => (i + 1) % list.length), 1800);
    return () => clearInterval(t);
  }, [active, list.length]);
  return list[idx] ?? list[0]!;
}

/* ── Recording timer ──────────────────────────────────────────────────── */

function useRecordingTimer(active: boolean): string {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) { setSecs(0); return; }
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/* ── Animated sound wave bars ─────────────────────────────────────────── */

function SoundWave({ color = "text-amber-400", size = "normal" }: { color?: string; size?: "normal" | "large" }) {
  const h   = size === "large" ? [0.5, 1, 0.7, 1, 0.5, 0.8, 1, 0.6] : [0.4, 1, 0.6, 1, 0.4];
  const bar = size === "large" ? "w-[3px]" : "w-[2px]";
  return (
    <span className={`inline-flex items-end gap-[2px] ${size === "large" ? "h-6" : "h-4"} mx-1`} aria-hidden>
      {h.map((hv, i) => (
        <span
          key={i}
          className={`${bar} rounded-full ${color} bg-current`}
          style={{
            height:    `${hv * 100}%`,
            animation: `soundbar 0.8s ease-in-out ${i * 0.07}s infinite alternate`,
          }}
        />
      ))}
    </span>
  );
}

/* ── Shared keyframes (injected once) ─────────────────────────────────── */

const STYLES = `
  @keyframes soundbar { from { transform:scaleY(0.25); } to { transform:scaleY(1); } }
  @keyframes fadeUp   { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
  @keyframes bounce   { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
  @keyframes spin     { to { transform:rotate(360deg); } }
  @keyframes pulseRed { 0%,100% { box-shadow:0 0 0 0 rgba(239,68,68,0.5); } 50% { box-shadow:0 0 0 10px rgba(239,68,68,0); } }
`;

/* ══════════════════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════════════════ */

export function VideoPlayerWithCapture({
  src, poster, subject, language = "ar", onAnswer, sessionId,
}: VideoPlayerWithCaptureProps) {

  const videoRef     = useRef<HTMLVideoElement>(null);
  const thumbRef     = useRef<HTMLCanvasElement>(null);
  const questionRef  = useRef<HTMLTextAreaElement>(null);

  const [phase,          setPhase]         = useState<Phase>("idle");
  const [capturedFrame,  setCapturedFrame]  = useState<VisionFrame | null>(null);
  const [question,       setQuestion]       = useState("");
  const [streamedAnswer, setStreamedAnswer] = useState("");
  const [finalAnswer,    setFinalAnswer]    = useState("");
  const [error,          setError]          = useState<string | null>(null);
  const [transcriptPreview, setTranscriptPreview] = useState("");

  const dir        = language === "ar" ? "rtl" : "ltr";
  const isAr       = language === "ar";
  const loadPhrase = useRotatingPhrase(language, phase === "analyzing");
  const recTimer   = useRecordingTimer(phase === "recording");

  const { ready: sttReady, backend: sttBackend, startSTT, stopAndTranscribe, cancelSTT } = useSTTEngine(language);

  /* Auto-focus question field when dialog opens */
  useLayoutEffect(() => {
    if (phase === "input") questionRef.current?.focus();
  }, [phase]);

  /* ── Thumbnail painter ──────────────────────────────────────────────── */

  const paintThumbnail = useCallback((frame: VisionFrame) => {
    const canvas = thumbRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = frame.base64;
  }, []);

  /* ── Pause → capture → show CTA ────────────────────────────────────── */

  const handlePause = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 2 || v.currentTime === 0 || v.ended) return;
    if (phase !== "idle") return;
    try {
      const frame = captureVideoFrame(v);
      setCapturedFrame(frame);
      paintThumbnail(frame);
      setQuestion(""); setFinalAnswer(""); setStreamedAnswer(""); setError(null);
      setPhase("cta");
    } catch { /* non-fatal */ }
  }, [phase, paintThumbnail]);

  /* ── Resume video + full reset ──────────────────────────────────────── */

  const resumeVideo = useCallback(() => {
    setPhase("idle");
    setQuestion(""); setFinalAnswer(""); setStreamedAnswer(""); setError(null);
    videoRef.current?.play().catch(() => { /* requires user gesture */ });
  }, []);

  /* ── Analyze frame ──────────────────────────────────────────────────── */

  const analyze = useCallback(async (q: string) => {
    if (!capturedFrame || !q.trim() || phase === "analyzing") return;

    setPhase("analyzing");
    setStreamedAnswer("");
    setFinalAnswer("");
    setError(null);

    try {
      const bridge = getWorkerBridge();
      const sid    = sessionId ?? `vision_${subject ?? "general"}_${Date.now()}`;
      let firstToken = true;

      const answer = await bridge.analyzeFrame(
        capturedFrame.base64, q.trim(),
        {
          sessionId: sid, subject, language,
          useRAG: true, stream: true,
          onToken: (token) => {
            if (firstToken) { setPhase("speaking"); firstToken = false; }
            setStreamedAnswer(prev => prev + token);
          },
        },
      );

      setFinalAnswer(answer);
      setStreamedAnswer("");
      if (firstToken) setPhase("speaking"); /* no tokens streamed, answer direct */
      onAnswer?.(answer, capturedFrame);

      /* TTS — speak once with teacher voice */
      await bridge.speak(answer, { onEnd: () => setPhase("done") });

    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("input");
    }
  }, [capturedFrame, phase, sessionId, subject, language, onAnswer]);

  /* ── Text submit ────────────────────────────────────────────────────── */

  const handleSubmit = useCallback(() => {
    void analyze(question);
  }, [analyze, question]);

  /* ── Mic: tap to start / tap again to stop → auto-submit ───────────── */

  const handleMicTap = useCallback(async () => {
    if (phase === "recording") {
      /* Stop + transcribe */
      setPhase("transcribing");
      setTranscriptPreview("");
      try {
        const text = await stopAndTranscribe();
        if (text.trim()) {
          setQuestion(text);
          setTranscriptPreview(text);
          /* Auto-submit after a short pause so user can see the text */
          setTimeout(() => void analyze(text), 500);
        } else {
          /* no-speech or silence — friendly message, stay on input phase */
          setError(isAr
            ? "لم أسمع شيئاً 🎙️ — تأكد من الميكروفون وحاول مجدداً"
            : "No speech detected 🎙️ — check your mic and try again");
          setPhase("input");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "STT failed";
        /* Translate common browser errors to Arabic */
        const friendly = isAr
          ? msg.includes("not-allowed") ? "تم رفض إذن الميكروفون"
          : msg.includes("audio-capture") ? "تعذّر التقاط الصوت"
          : msg.includes("network") ? "خطأ في الشبكة"
          : "خطأ في التعرف على الصوت"
          : msg;
        setError(friendly);
        setPhase("input");
      }
    } else {
      /* Start recording */
      setError(null);
      setTranscriptPreview("");
      try {
        await startSTT();
        setPhase("recording");
      } catch {
        setError(isAr ? "تعذّر الوصول إلى الميكروفون" : "Microphone access denied");
      }
    }
  }, [phase, startSTT, stopAndTranscribe, analyze, isAr]);

  /* ── Cancel recording ───────────────────────────────────────────────── */

  const handleCancelRecording = useCallback(() => {
    cancelSTT();
    setPhase("input");
  }, [cancelSTT]);

  /* ── Stop TTS ───────────────────────────────────────────────────────── */

  const handleStopTTS = useCallback(() => {
    getWorkerBridge().stopTTS();
    setPhase("done");
  }, []);

  const displayText = streamedAnswer || finalAnswer;

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-black shadow-2xl select-none" dir={dir}>
      <style>{STYLES}</style>

      {/* ══ Video ══════════════════════════════════════════════════════ */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        onPause={handlePause}
        className="w-full h-auto block"
        style={{ maxHeight: "72vh" }}
      />

      {/* ══ CTA — اسأل الأستاذ ════════════════════════════════════════ */}
      {phase === "cta" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-end pb-10"
          style={{ background: "linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.85) 70%)" }}
        >
          <span
            className="absolute top-3 text-white/50 text-[11px] font-mono bg-black/40 px-2.5 py-0.5 rounded-full"
            style={{ [isAr ? "right" : "left"]: 12 }}
          >
            ⏸ {capturedFrame?.videoTime.toFixed(1)}s
          </span>

          <button
            onClick={() => setPhase("input")}
            className="flex items-center gap-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-white font-bold text-base px-7 py-3.5 rounded-2xl shadow-2xl shadow-amber-500/40 transition-all duration-150 mb-3"
            style={{ animation: "fadeUp 0.3s ease" }}
          >
            <span className="text-2xl">🎓</span>
            <span>{isAr ? "اسأل الأستاذ" : "Ask Tutor"}</span>
          </button>

          <button
            onClick={resumeVideo}
            className="text-white/45 hover:text-white/75 text-xs underline underline-offset-2 transition-colors"
          >
            {isAr ? "▶ متابعة الفيديو" : "▶ Resume video"}
          </button>
        </div>
      )}

      {/* ══ INPUT dialog ═════════════════════════════════════════════ */}
      {phase === "input" && (
        <div
          className="absolute inset-0 flex flex-col"
          style={{ background: "linear-gradient(to bottom, transparent 22%, rgba(0,0,0,0.96) 58%)" }}
        >
          {/* Thumbnail + close */}
          <div className="flex items-start justify-between px-4 pt-4 gap-3">
            <canvas
              ref={thumbRef}
              className="rounded-xl border-2 border-amber-400/50 shadow-lg"
              style={{ width: 110, height: "auto", maxHeight: 74 }}
            />
            <button onClick={() => setPhase("cta")} className="text-white/45 hover:text-white text-xl font-bold mt-1 transition-colors">✕</button>
          </div>

          <div className="mt-auto px-4 pb-5 flex flex-col gap-3">
            <p className="text-white/65 text-sm font-medium">
              {isAr ? "💬 ما الذي تريد أن تسأل عنه؟" : "💬 What would you like to ask?"}
            </p>

            {/* Transcript preview from last STT session */}
            {transcriptPreview && (
              <div className="bg-amber-500/15 border border-amber-400/30 rounded-xl px-3 py-1.5 text-amber-200 text-xs">
                🎙 {transcriptPreview}
              </div>
            )}

            {error && (
              <div className="bg-red-500/20 border border-red-400/40 rounded-xl px-3 py-1.5 text-red-200 text-xs">
                ⚠️ {error}
              </div>
            )}

            <div className="flex gap-2 items-end">
              <textarea
                ref={questionRef}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder={isAr ? "اكتب سؤالك هنا…" : "Type your question here…"}
                rows={2}
                dir={dir}
                className="flex-1 bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-4 py-2.5 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:border-amber-400/60 transition-colors"
              />

              {/* Mic button */}
              {sttReady && (
                <button
                  onClick={() => void handleMicTap()}
                  title={isAr
                    ? (sttBackend === "whisper-webgpu" ? "اضغط للتسجيل (Whisper)" : "اضغط للتحدث (المتصفح)")
                    : (sttBackend === "browser-api" ? "Click to speak" : "Click to record")}
                  className="flex-shrink-0 w-12 h-12 rounded-full flex flex-col items-center justify-center text-lg transition-all shadow-lg bg-white/15 hover:bg-amber-500/80 hover:text-white active:scale-95"
                >
                  🎙️
                  <span className="text-[9px] text-white/40 leading-none -mt-0.5">
                    {sttBackend === "browser-api" ? "API" : "AI"}
                  </span>
                </button>
              )}

              <button
                onClick={handleSubmit}
                disabled={!question.trim()}
                className={[
                  "flex-shrink-0 h-12 px-5 rounded-2xl font-bold text-sm transition-all shadow-lg",
                  question.trim()
                    ? "bg-amber-500 hover:bg-amber-400 active:scale-95 text-white"
                    : "bg-white/8 text-white/22 cursor-not-allowed",
                ].join(" ")}
              >
                {isAr ? "إرسال ✦" : "Send ✦"}
              </button>
            </div>

            <p className="text-center text-white/22 text-[10px]">
              {isAr ? "تحليل محلي كامل — بدون إنترنت" : "Fully offline analysis — no internet"}
              {sttReady && (
                <span className="mx-1">·</span>
              )}
              {sttReady && (
                <span className="text-amber-400/60">
                  {sttBackend === "browser-api"
                    ? (isAr ? "STT: المتصفح" : "STT: Browser")
                    : (isAr ? "STT: Whisper AI" : "STT: Whisper AI")}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ══ RECORDING ════════════════════════════════════════════════ */}
      {phase === "recording" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-5"
          style={{ background: "rgba(8,4,20,0.94)" }}
        >
          {/* Thumbnail top */}
          <canvas
            ref={thumbRef}
            className="rounded-xl border border-amber-400/30 shadow-lg opacity-60"
            style={{ width: 100, height: "auto", maxHeight: 68 }}
          />

          {/* Pulsing mic */}
          <div className="relative flex items-center justify-center">
            <span
              className="absolute w-24 h-24 rounded-full bg-red-500/20"
              style={{ animation: "pulseRed 1.2s ease-in-out infinite" }}
            />
            <button
              onClick={() => void handleMicTap()}
              className="relative w-20 h-20 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center text-4xl shadow-2xl shadow-red-500/40 transition-colors active:scale-95"
              title={isAr ? "اضغط للإيقاف والتحليل" : "Tap to stop & analyze"}
            >
              🎙️
            </button>
          </div>

          {/* Waveform */}
          <SoundWave color="text-red-400" size="large" />

          <div className="text-center">
            <p className="text-white font-bold text-base">
              {isAr ? "جاري التسجيل…" : "Recording…"}
            </p>
            <p className="text-red-400 font-mono text-sm mt-0.5">{recTimer}</p>
            <p className="text-white/40 text-xs mt-2">
              {isAr ? "اضغط على الميكروفون للإيقاف والتحليل" : "Tap mic to stop & analyze"}
            </p>
          </div>

          <button
            onClick={handleCancelRecording}
            className="text-white/35 hover:text-white/65 text-xs underline underline-offset-2 transition-colors"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </button>
        </div>
      )}

      {/* ══ TRANSCRIBING ══════════════════════════════════════════════ */}
      {phase === "transcribing" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8"
          style={{ background: "rgba(8,4,20,0.94)" }}
        >
          <div className="relative w-16 h-16">
            <span
              className="absolute inset-0 rounded-full border-4 border-purple-500/30 border-t-purple-400"
              style={{ animation: "spin 1s linear infinite" }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-2xl">🗣️</span>
          </div>
          <div className="text-center">
            <p className="text-white font-semibold text-base">
              {isAr ? "جاري تحويل الصوت إلى نص…" : "Converting speech to text…"}
            </p>
            <p className="text-white/40 text-xs mt-1">
              {sttBackend === "browser-api"
                ? (isAr ? "باستخدام محرك المتصفح" : "Using browser engine")
                : (isAr ? "باستخدام Whisper AI محلياً" : "Using local Whisper AI")}
            </p>
          </div>
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-2 h-2 bg-purple-400 rounded-full"
                style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}/>
            ))}
          </div>
        </div>
      )}

      {/* ══ ANALYZING ════════════════════════════════════════════════ */}
      {phase === "analyzing" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8"
          style={{ background: "rgba(8,4,20,0.93)" }}
        >
          <div className="relative w-20 h-20">
            <span
              className="absolute inset-0 rounded-full border-4 border-amber-500/30 border-t-amber-500"
              style={{ animation: "spin 1.2s linear infinite" }}
            />
            <span
              className="absolute inset-3 rounded-full border-4 border-purple-400/25 border-b-purple-400"
              style={{ animation: "spin 0.8s linear infinite reverse" }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-3xl">🔍</span>
          </div>

          <div className="text-center">
            <p
              className="text-white font-semibold text-base"
              key={loadPhrase}
              style={{ animation: "fadeUp 0.4s ease" }}
            >
              {loadPhrase}
            </p>
            {question && (
              <p className="text-white/35 text-xs mt-1 max-w-xs mx-auto line-clamp-2">
                {isAr ? `"${question}"` : `"${question}"`}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-2 h-2 bg-amber-400 rounded-full"
                style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}/>
            ))}
          </div>
        </div>
      )}

      {/* ══ SPEAKING / DONE ══════════════════════════════════════════ */}
      {(phase === "speaking" || phase === "done") && (
        <div
          className="absolute inset-0 flex flex-col"
          style={{ background: "linear-gradient(to bottom, transparent 18%, rgba(0,0,0,0.97) 52%)" }}
        >
          {/* Top row: thumbnail + controls */}
          <div className="flex items-start justify-between px-4 pt-4 gap-3">
            <canvas
              ref={thumbRef}
              className="rounded-xl border-2 border-amber-400/45 shadow-lg"
              style={{ width: 96, height: "auto", maxHeight: 66 }}
            />
            <div className="flex flex-col items-end gap-1.5 mt-0.5">
              {phase === "speaking" && (
                <button
                  onClick={handleStopTTS}
                  className="text-amber-300 hover:text-amber-100 text-xs font-semibold bg-white/10 hover:bg-white/18 px-3 py-1.5 rounded-xl transition-colors"
                >
                  ⏹ {isAr ? "إيقاف الصوت" : "Stop audio"}
                </button>
              )}
              <button onClick={resumeVideo} className="text-white/35 hover:text-white/65 text-[11px] transition-colors">
                {isAr ? "إغلاق ✕" : "Close ✕"}
              </button>
            </div>
          </div>

          {/* Answer card */}
          <div className="mt-auto mx-4 mb-4 rounded-2xl border border-white/10 bg-white/7 backdrop-blur-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/5">
              <span className="text-base">🎓</span>
              <span className="text-white/75 text-xs font-semibold tracking-wide">
                {isAr ? "إجابة الأستاذ" : "Tutor's Answer"}
              </span>
              {phase === "speaking" && (
                <span className="flex items-center gap-1 text-amber-400 text-xs font-medium ms-auto">
                  <SoundWave />
                  {isAr ? "يتحدث الآن" : "Speaking"}
                </span>
              )}
              {phase === "done" && (
                <span className="text-green-400/65 text-xs ms-auto">
                  {isAr ? "✓ اكتملت" : "✓ Done"}
                </span>
              )}
            </div>

            {/* Answer text */}
            <div className="px-4 py-3 max-h-44 overflow-y-auto">
              <p className="text-white/88 text-sm leading-relaxed" dir={dir}>
                {displayText}
                {phase === "speaking" && streamedAnswer && (
                  <span className="inline-block w-[2px] h-[1em] bg-amber-400 ml-0.5 animate-pulse align-middle" />
                )}
              </p>
            </div>

            {/* Footer: ask again / resume */}
            {phase === "done" && (
              <div className="flex gap-2 px-4 pb-3">
                <button
                  onClick={() => {
                    setQuestion(""); setFinalAnswer(""); setStreamedAnswer("");
                    setTranscriptPreview(""); setError(null);
                    setPhase("input");
                  }}
                  className="flex-1 text-center text-amber-300 hover:text-amber-100 text-xs font-semibold bg-white/8 hover:bg-white/15 px-4 py-2 rounded-xl transition-colors"
                >
                  {isAr ? "💬 سؤال آخر" : "💬 Ask another"}
                </button>
                <button
                  onClick={resumeVideo}
                  className="flex-1 text-center text-white font-bold text-xs bg-amber-500 hover:bg-amber-400 active:scale-95 px-4 py-2 rounded-xl transition-colors"
                >
                  {isAr ? "▶ متابعة الفيديو" : "▶ Resume video"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoPlayerWithCapture;

