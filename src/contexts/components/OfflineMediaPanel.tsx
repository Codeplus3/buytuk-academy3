/* ─── OfflineMediaEngine — Student UI Panel ─── */

import { useState, useEffect, useRef, useCallback } from "react";
import { OfflineMediaEngine } from "@/lib/offline-media-engine";
import type {
  MediaEngineCapabilities, BookMetadata, TextChunk,
  VectorSearchResult, TutorMessage,
} from "@/lib/offline-media-engine";
import type { AITutor } from "@/lib/offline-media-engine/ai-tutor";
import {
  LocalSTTEngine,
  type STTBackendType,
} from "@/lib/offline-media-engine/skeleton/local-stt-engine";
import { VOICES } from "./VoiceProfilesPanel";

const ACTIVE_VOICE_KEY = "buytuk_active_voice";

interface Props { studentEmail: string; hideStatus?: boolean }

type PanelTab = "library" | "reader" | "tutor" | "search" | "status";

const engine = OfflineMediaEngine.getInstance();

const SUBJECT_ICONS: Record<string, string> = {
  "رياضيات": "📐", "فيزياء": "⚛️", "كيمياء": "🧪",
  "أحياء":   "🧬", "حاسب":   "💻", "عربية":  "📖",
};

export function OfflineMediaPanel({ studentEmail, hideStatus = false }: Props) {
  const [panelTab, setPanelTab]       = useState<PanelTab>("library");
  const [caps, setCaps]               = useState<MediaEngineCapabilities | null>(null);
  const [initialising, setInit]       = useState(true);
  const [books, setBooks]             = useState<BookMetadata[]>([]);
  const [openBook, setOpenBook]       = useState<BookMetadata | null>(null);
  const [chunks, setChunks]           = useState<TextChunk[]>([]);
  const [chapterIdx, setChapterIdx]   = useState(0);
  const [ttsActive, setTtsActive]     = useState(false);
  const [ttsWord, setTtsWord]         = useState("");
  const [ttsPaused, setTtsPaused]     = useState(false);

  /* ── صوت المدرس المختار ─────────────────────────────────────────────── */
  const [activeVoiceId, setActiveVoiceId] = useState<string>(
    () => localStorage.getItem(ACTIVE_VOICE_KEY) ?? VOICES[2].id,
  );
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const activeVoice = VOICES.find(v => v.id === activeVoiceId) ?? VOICES[2];

  /* ── تهيئة الصوت عند تغيير البصمة ───────────────────────────────── */
  useEffect(() => {
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current.src = "";
    }
    const a = new Audio(activeVoice.file);
    a.preload = "auto";
    a.addEventListener("ended", () => { setTtsActive(false); setTtsPaused(false); });
    voiceAudioRef.current = a;
    setTtsActive(false); setTtsPaused(false);
    return () => { a.pause(); a.src = ""; };
  }, [activeVoiceId, activeVoice.file]);

  const selectVoice = (id: string) => {
    localStorage.setItem(ACTIVE_VOICE_KEY, id);
    if (voiceAudioRef.current) voiceAudioRef.current.pause();
    setTtsActive(false); setTtsPaused(false);
    setActiveVoiceId(id);
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VectorSearchResult[]>([]);
  const [searching, setSearching]     = useState(false);
  const [subject, setSubject]         = useState("رياضيات");
  const [messages, setMessages]       = useState<TutorMessage[]>([]);
  const [input, setInput]             = useState("");
  const [tutorLoading, setTutorLoad]  = useState(false);
  const tutorRef  = useRef<AITutor | null>(null);
  const chatRef   = useRef<HTMLDivElement>(null);
  const sttRef    = useRef<LocalSTTEngine | null>(null);

  /* ── STT state ── */
  const [sttReady,       setSttReady]       = useState(false);
  const [sttBackend,     setSttBackend]     = useState<STTBackendType | null>(null);
  const [sttRecording,   setSttRecording]   = useState(false);
  const [sttTranscribing,setSttTranscribing]= useState(false);

  /* ── STT init ── */
  useEffect(() => {
    const s = new LocalSTTEngine({ language: "ar", maxDurationMs: 20_000 });
    sttRef.current = s;
    s.init().then(status => {
      setSttBackend(status.backend);
      setSttReady(true);
    }).catch(() => { /* mic not available */ });
    return () => { s.dispose(); };
  }, []);

  /* ── STT no-speech toast (transient, auto-clears) ── */
  const [sttHint, setSttHint] = useState("");
  const showSttHint = (msg: string) => {
    setSttHint(msg);
    setTimeout(() => setSttHint(""), 3500);
  };

  /* ── Mic tap: idle→recording or recording→transcribe→fill input ── */
  const handleMicTap = useCallback(async () => {
    const s = sttRef.current;
    if (!s || !s.isReady || sttTranscribing) return;

    if (!sttRecording) {
      /* Start */
      setSttRecording(true);
      if (s.backend !== "browser-api") {
        try { await s.startRecording(); }
        catch { setSttRecording(false); showSttHint("تعذّر الوصول إلى الميكروفون"); return; }
      }
    } else {
      /* Stop → transcribe */
      setSttRecording(false);
      setSttTranscribing(true);
      try {
        const res = s.backend === "browser-api"
          ? await s.transcribeFromMic()
          : await s.stopAndTranscribe();
        const text = res.text.trim();
        if (text) {
          setInput(prev => (prev ? prev + " " + text : text));
        } else {
          /* no-speech: friendly hint, engine stays alive and ready */
          showSttHint("لم أسمع شيئاً 🎙️ — حاول مرة أخرى");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        showSttHint(msg.includes("not-allowed")
          ? "تم رفض إذن الميكروفون"
          : msg.includes("audio-capture")
          ? "تعذّر التقاط الصوت"
          : "خطأ في التعرف على الصوت");
      } finally {
        setSttTranscribing(false);
      }
    }
  }, [sttRecording, sttTranscribing]);

  useEffect(() => {
    (async () => {
      const c = await engine.init();
      setCaps(c);
      setInit(false);
      const bks = await engine.getBookList();
      setBooks(bks);
    })();
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  /* ── Tutor init when subject changes ── */
  const initTutor = async (subj: string) => {
    const t = engine.createTutor(studentEmail, subj);
    await t.init();
    tutorRef.current = t;
    setMessages([]);
    const greeting = await t.chat(`مرحباً، أريد الدراسة في ${subj}`);
    setMessages([greeting]);
  };

  useEffect(() => {
    if (panelTab === "tutor") initTutor(subject);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelTab, subject]);

  /* ── Open book ── */
  const openBookFn = async (bk: BookMetadata) => {
    setOpenBook(bk);
    setChapterIdx(0);
    const cks = await engine.getBookChunks(bk.id);
    setChunks(cks);
    setPanelTab("reader");
  };

  /* ── Chapter text ── */
  const chapterChunks = chunks.filter(c => c.chapterIndex === chapterIdx);
  const chapterText   = chapterChunks.map(c => c.text).join("\n\n");

  /* ── معامِلات TTS لكل مدرس ──────────────────────────────────────────── */
  const VOICE_TTS_PARAMS: Record<string, { rate: number; pitch: number }> = {
    v_114:        { rate: 0.82, pitch: 0.90 },  // المدرس الأول — هادئ ومتأنٍّ
    v_001:        { rate: 0.88, pitch: 1.00 },  // المدرس الثاني — معتدل
    v_abdulbasit: { rate: 0.78, pitch: 0.85 },  // المدرس الثالث — بطيء وعميق
  };

  /* ── TTS — يقرأ نص الفصل الحالي ──────────────────────────────────── */
  const speakChapter = async () => {
    if (!chapterText) return;
    const params = VOICE_TTS_PARAMS[activeVoiceId] ?? { rate: 0.88, pitch: 1.0 };
    setTtsActive(true); setTtsWord("");
    await engine.readAloud(chapterText, {
      rate:   params.rate,
      onWord: w => setTtsWord(w),
      onEnd:  () => { setTtsActive(false); setTtsPaused(false); setTtsWord(""); },
    });
    setTtsActive(false);
  };
  const pauseResumeTTS = () => {
    if (ttsPaused) { engine.resumeTTS(); setTtsPaused(false); }
    else           { engine.pauseTTS();  setTtsPaused(true);  }
  };
  const stopTTS = () => {
    engine.stopTTS();
    setTtsActive(false); setTtsPaused(false); setTtsWord("");
  };

  /* ── Search ── */
  const doSearch = () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setTimeout(() => {
      setSearchResults(engine.semanticSearch(searchQuery, 6));
      setSearching(false);
    }, 60);
  };

  /* ── Tutor chat ── */
  const sendMessage = async () => {
    if (!input.trim() || !tutorRef.current || tutorLoading) return;
    const q = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user" as const, content: q, timestamp: Date.now() }]);
    setTutorLoad(true);
    const reply = await tutorRef.current.chat(q);
    setMessages(m => [...m, reply]);
    setTutorLoad(false);
    await engine.saveTutorSession(tutorRef.current.getSession());
  };

  /* ── Capability badge ── */
  const CapBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`badge ${ok ? "badge-success" : "badge-danger"}`} style={{ fontSize: 11, gap: 4 }}>
      {ok ? "✅" : "❌"} {label}
    </span>
  );

  const NAV: { id: PanelTab; icon: string; label: string }[] = [
    { id: "library", icon: "📚", label: "المكتبة" },
    { id: "reader",  icon: "📖", label: "التوأم الرقمي" },
    { id: "tutor",   icon: "🤖", label: "المساعد الذكي" },
    { id: "search",  icon: "🔍", label: "البحث الدلالي" },
    ...(!hideStatus ? [{ id: "status" as PanelTab, icon: "⚙️", label: "حالة المحرك" }] : []),
  ];

  if (initialising) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 16 }}>
      <div style={{ width: 52, height: 52, border: "3px solid rgba(108,99,255,0.2)", borderTopColor: "var(--primary)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>جارٍ تهيئة OfflineMediaEngine…</p>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 20 }}>
      {/* Sub-nav */}
      <aside style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setPanelTab(n.id)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: panelTab === n.id ? "rgba(108,99,255,0.12)" : "transparent", border: panelTab === n.id ? "1px solid rgba(108,99,255,0.3)" : "1px solid transparent", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: panelTab === n.id ? 700 : 500, color: panelTab === n.id ? "var(--primary)" : "var(--text-muted)", fontFamily: "inherit", textAlign: "right" }}>
            {n.icon} {n.label}
          </button>
        ))}
        <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.2)", borderRadius: 8, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
          🟢 يعمل بدون إنترنت<br />
          بياناتك محفوظة محلياً
        </div>
      </aside>

      {/* Content */}
      <div className="fade-in">

        {/* ── LIBRARY ── */}
        {panelTab === "library" && (
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>📚 المكتبة المحلية المشفّرة</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>جميع الكتب مُخزَّنة في IndexedDB وتعمل بدون إنترنت</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
              {books.map(bk => (
                <div key={bk.id} style={{ background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 18, cursor: "pointer", transition: "var(--transition)" }}
                  onClick={() => openBookFn(bk)}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--primary)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--glass-border)")}>
                  <div style={{ fontSize: 38, marginBottom: 10 }}>{SUBJECT_ICONS[bk.subject] ?? "📘"}</div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{bk.title}</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                    <span className="badge badge-primary">{bk.subject}</span>
                    <span className="badge badge-info">{bk.chapters.length} فصول</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span className="badge" style={{ background: "rgba(0,200,150,0.1)", color: "var(--success)", fontSize: 10 }}>🔒 مشفّر</span>
                    <span className="badge" style={{ background: "rgba(108,99,255,0.1)", color: "var(--primary)", fontSize: 10 }}>📴 Offline</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>انقر للقراءة →</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── READER ── */}
        {panelTab === "reader" && (
          <div>
            {!openBook ? (
              <div style={{ textAlign: "center", padding: "50px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>📖</div>
                <p style={{ color: "var(--text-muted)" }}>اختر كتاباً من المكتبة أولاً</p>
                <button onClick={() => setPanelTab("library")} style={{ marginTop: 12, padding: "9px 20px", background: "var(--primary)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13 }}>
                  إلى المكتبة
                </button>
              </div>
            ) : (
              <>
                {/* Book header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{openBook.title}</h3>
                    <span className="badge badge-primary">{openBook.subject}</span>
                    {" "}
                    <span className="badge" style={{ background: "rgba(0,200,150,0.1)", color: "var(--success)", fontSize: 10 }}>🔒 AES-GCM محمي</span>
                  </div>
                  <button onClick={() => { stopTTS(); setOpenBook(null); setPanelTab("library"); }}
                    style={{ padding: "5px 14px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text-muted)", fontFamily: "inherit", fontSize: 12 }}>✕ إغلاق</button>
                </div>

                {/* Chapter tabs */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {openBook.chapters.map((ch, i) => (
                    <button key={i} onClick={() => { stopTTS(); setChapterIdx(i); }}
                      style={{ padding: "5px 12px", background: chapterIdx === i ? "var(--primary)" : "var(--card)", border: `1px solid ${chapterIdx === i ? "var(--primary)" : "var(--border)"}`, borderRadius: 6, cursor: "pointer", color: chapterIdx === i ? "#fff" : "var(--text-muted)", fontFamily: "inherit", fontSize: 11, fontWeight: chapterIdx === i ? 700 : 400 }}>
                      {i + 1}. {ch.length > 18 ? ch.slice(0, 18) + "…" : ch}
                    </button>
                  ))}
                </div>

                {/* TTS bar — teacher voice */}
                <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)" }}>

                  {/* voice selector */}
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, fontWeight: 700 }}>
                    🎙 اختر صوت المدرس:
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {VOICES.map(v => {
                      const sel = v.id === activeVoiceId;
                      return (
                        <button key={v.id} onClick={() => selectVoice(v.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "5px 14px", borderRadius: 20, cursor: "pointer",
                            fontFamily: "inherit", fontSize: 12,
                            border: `2px solid ${sel ? v.color : "var(--glass-border)"}`,
                            background: sel ? `${v.color}1a` : "transparent",
                            color: sel ? v.color : "var(--text-muted)",
                            fontWeight: sel ? 800 : 500,
                            transition: "all 0.15s",
                          }}>
                          <span>👨‍🏫</span>
                          <span>{v.name}</span>
                          {sel && ttsActive && !ttsPaused && (
                            <span style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 12 }}>
                              {[1,2,1].map((h,i) => (
                                <span key={i} style={{
                                  display: "inline-block", width: 3,
                                  height: h * 4, background: v.color, borderRadius: 2,
                                  animation: `wave-omp 0.5s ease-in-out ${i*0.15}s infinite alternate`,
                                }} />
                              ))}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* play controls */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>
                      🔊 {activeVoice.name}:
                    </span>
                    {!ttsActive
                      ? <button onClick={speakChapter}
                          style={{ padding: "6px 16px", background: activeVoice.color, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12 }}>
                          ▶ قراءة الفصل
                        </button>
                      : <>
                          <button onClick={pauseResumeTTS}
                            style={{ padding: "6px 12px", background: "var(--warning)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12 }}>
                            {ttsPaused ? "▶ استمرار" : "⏸ إيقاف مؤقت"}
                          </button>
                          <button onClick={stopTTS}
                            style={{ padding: "6px 12px", background: "var(--danger)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12 }}>
                            ⏹ إيقاف
                          </button>
                        </>
                    }
                  </div>
                </div>
                <style>{`@keyframes wave-omp{from{transform:scaleY(1)}to{transform:scaleY(2.5)}}`}</style>

                {/* Text */}
                <div style={{ background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 24, lineHeight: 2.1, fontSize: 15, maxHeight: 460, overflowY: "auto" }}>
                  {chapterChunks.length === 0
                    ? <p style={{ color: "var(--text-muted)", textAlign: "center" }}>لا يوجد محتوى لهذا الفصل</p>
                    : chapterChunks.map((ch, i) => (
                        <p key={i} style={{ marginBottom: 14 }}>{ch.text}</p>
                      ))
                  }
                </div>
              </>
            )}
          </div>
        )}

        {/* ── AI TUTOR ── */}
        {panelTab === "tutor" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 2 }}>🤖 المساعد الذكي (AI Tutor)</h3>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  SLM محلي • WebGPU: {caps?.gpu.backend ?? "—"} • RAG من IndexedDB
                </p>
              </div>
              <select value={subject} onChange={e => setSubject(e.target.value)}
                style={{ padding: "7px 14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>
                {["رياضيات","فيزياء","كيمياء","أحياء","حاسب","عربية"].map(s => (
                  <option key={s} value={s}>{SUBJECT_ICONS[s]} {s}</option>
                ))}
              </select>
            </div>

            {/* Chat area */}
            <div ref={chatRef} style={{ height: 360, overflowY: "auto", background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 16, marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--text-muted)", paddingTop: 60, fontSize: 13 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🤖</div>
                  جارٍ تهيئة المساعد…
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-start" : "flex-end" }}>
                  <div style={{
                    maxWidth: "78%", padding: "10px 14px", borderRadius: 12,
                    background: msg.role === "user" ? "rgba(108,99,255,0.12)" : "rgba(0,200,150,0.10)",
                    border: `1px solid ${msg.role === "user" ? "rgba(108,99,255,0.25)" : "rgba(0,200,150,0.25)"}`,
                    fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
                  }}>
                    {msg.role === "assistant" && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>🤖 AI Tutor ({subject})</div>}
                    {msg.content}
                  </div>
                </div>
              ))}
              {tutorLoading && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ padding: "10px 16px", background: "rgba(0,200,150,0.08)", border: "1px solid rgba(0,200,150,0.2)", borderRadius: 12, fontSize: 12, color: "var(--text-muted)" }}>
                    <span style={{ display: "inline-block", animation: "spin 0.8s linear infinite", width: 14, height: 14, border: "2px solid rgba(0,200,150,0.3)", borderTopColor: "var(--success)", borderRadius: "50%", verticalAlign: "middle", marginLeft: 6 }} />
                    جارٍ التفكير…
                  </div>
                </div>
              )}
            </div>

            {/* Input row */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                className="form-control" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && void sendMessage()}
                placeholder={sttRecording ? "🔴 جارٍ التسجيل… اضغط الميكروفون للإيقاف" : sttTranscribing ? "⏳ جارٍ التحويل…" : `اسأل عن ${subject}…`}
                style={{ flex: 1, borderColor: sttRecording ? "var(--danger)" : undefined }}
                disabled={sttRecording || sttTranscribing}
              />

              {/* Mic button — shows only when STT is available */}
              {sttReady && (
                <button
                  onClick={() => void handleMicTap()}
                  title={sttRecording
                    ? "اضغط لإيقاف التسجيل وتحويله إلى نص"
                    : sttTranscribing
                    ? "جارٍ التحويل…"
                    : sttBackend === "browser-api"
                    ? "تحدّث (Web Speech API)"
                    : "سجّل سؤالك (Whisper AI)"}
                  style={{
                    flexShrink:   0,
                    width:        42,
                    height:       42,
                    borderRadius: "50%",
                    border:       sttRecording
                      ? "2px solid var(--danger)"
                      : "1px solid var(--glass-border)",
                    background:   sttRecording
                      ? "rgba(255,71,87,0.15)"
                      : sttTranscribing
                      ? "rgba(108,99,255,0.15)"
                      : "var(--card)",
                    cursor:       sttTranscribing ? "wait" : "pointer",
                    fontSize:     18,
                    display:      "flex",
                    flexDirection:"column",
                    alignItems:   "center",
                    justifyContent:"center",
                    gap:          1,
                    transition:   "all 0.2s",
                    animation:    sttRecording ? "pulse 1s ease-in-out infinite" : "none",
                  }}
                >
                  {sttTranscribing ? "⏳" : "🎙️"}
                  <span style={{ fontSize: 8, color: "var(--text-muted)", lineHeight: 1 }}>
                    {sttBackend === "browser-api" ? "API" : "AI"}
                  </span>
                </button>
              )}

              <button
                onClick={() => void sendMessage()}
                disabled={tutorLoading || !input.trim() || sttRecording || sttTranscribing}
                style={{
                  padding: "10px 18px",
                  background: "linear-gradient(135deg, var(--primary), var(--primary-dark))",
                  border: "none", borderRadius: "var(--radius-sm)",
                  color: "#fff", cursor: "pointer", fontFamily: "inherit",
                  fontWeight: 700, fontSize: 13,
                  opacity: tutorLoading || !input.trim() || sttRecording || sttTranscribing ? 0.5 : 1,
                  flexShrink: 0,
                }}>
                إرسال ↑
              </button>
            </div>

            {/* STT status + footer */}
            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, textAlign: "center" }}>
              يعمل محلياً 100% • بدون إنترنت • البيانات مشفّرة في IndexedDB
              {sttReady && (
                <span style={{ marginRight: 6, color: "var(--success)" }}>
                  {" "}• 🎙 STT: {sttBackend === "browser-api" ? "Web Speech" : "Whisper AI"} جاهز
                </span>
              )}
            </p>
          </div>
        )}

        {/* ── SEMANTIC SEARCH ── */}
        {panelTab === "search" && (
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>🔍 البحث الدلالي المحلي</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
              TF-IDF + Cosine Similarity • بحث داخل {engine.search.size} قطعة نصية • يعمل Offline
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <input className="form-control" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doSearch()}
                placeholder="ابحث عن مفهوم، معادلة، أو موضوع…"
                style={{ flex: 1 }} />
              <button onClick={doSearch} disabled={searching}
                style={{ padding: "10px 18px", background: "linear-gradient(135deg, var(--info), var(--primary))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13 }}>
                {searching ? "⏳" : "بحث"}
              </button>
            </div>

            {/* Quick suggestions */}
            {searchResults.length === 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>اقتراحات:</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["مشتقة","قانون نيوتن","pH الأحماض","الـDNA","خوارزمية","الجملة الاسمية","التفاعلات الكيميائية","البناء الضوئي"].map(s => (
                    <button key={s} onClick={() => { setSearchQuery(s); setTimeout(doSearch, 50); }}
                      style={{ padding: "4px 10px", background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 20, cursor: "pointer", fontSize: 11, color: "var(--primary)", fontFamily: "inherit" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {searchResults.map((r, i) => (
                <div key={i} style={{ background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span className="badge badge-primary" style={{ fontSize: 10 }}>كتاب: {r.bookId.replace("book_","")}</span>
                      <span className="badge badge-info" style={{ fontSize: 10 }}>فصل {r.chapterIndex + 1}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 60, height: 5, background: "rgba(255,255,255,0.1)", borderRadius: 3 }}>
                        <div style={{ width: `${Math.round(r.score * 333)}%`, height: "100%", background: "var(--success)", borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{(r.score * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text)" }}>{r.highlight}</p>
                  <button onClick={() => engine.readAloud(r.text)}
                    style={{ marginTop: 8, padding: "4px 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11, color: "var(--text-muted)", fontFamily: "inherit" }}>
                    🔊 استمع
                  </button>
                </div>
              ))}
              {searchQuery && searchResults.length === 0 && !searching && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
                  لم يُعثر على نتائج لـ "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STATUS ── */}
        {panelTab === "status" && caps && (
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>⚙️ حالة النظام</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
              جميع البيانات محفوظة على جهازك — لا حاجة للإنترنت
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {[
                { label: "Local TTS Engine",     ok: caps.tts,          detail: `${caps.ttsVoices} أصوات • ${caps.arabicVoice ? "عربي ✓" : "بدون عربي"}` },
                { label: "IndexedDB Storage",    ok: caps.indexedDB,    detail: `${engine.search.size} مقطع نصي مُفهرس` },
                { label: "GPU Compute (WebGPU)", ok: caps.gpu.available,detail: caps.gpu.backend + (caps.gpu.device ? ` — ${caps.gpu.device}` : "") },
                { label: "SubtleCrypto AES-GCM", ok: caps.crypto,       detail: "تشفير 256-bit محلي" },
                { label: "Worker Threads",        ok: caps.workerThreads,detail: "معالجة معزولة" },
                { label: "Offline-First",         ok: true,             detail: "صفر طلبات شبكة" },
              ].map(item => (
                <div key={item.label} style={{ background: "var(--card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius)", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>{item.label}</strong>
                    <CapBadge ok={item.ok} label={item.ok ? "فعّال" : "غير متاح"} />
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.detail}</p>
                </div>
              ))}
            </div>

            {/* Security confirmation — student-friendly */}
            <div style={{ background: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.2)", borderRadius: "var(--radius)", padding: 18 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🔐 حماية بياناتك</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 2 }}>
                <li>✅ بياناتك محفوظة بالكامل على جهازك</li>
                <li>✅ تشفير كامل 256-bit لجميع الملفات</li>
                <li>✅ لا يُرسَل شيء للإنترنت دون إذنك</li>
                <li>✅ يعمل المحتوى حتى بدون اتصال</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

