/* ─── SubjectStudyView — Interactive Per-Subject Study Interface ─── */
import { useState, useEffect, useRef } from "react";
import { loadCurriculumFile } from "../lib/db";
import type { Subject } from "../lib/db";
import { OfflineMediaEngine } from "../lib/offline-media-engine";
import type { BookMetadata, TextChunk, TutorMessage } from "../lib/offline-media-engine";
import type { AITutor } from "../lib/offline-media-engine/ai-tutor";

const engine = OfflineMediaEngine.getInstance();

interface Props {
  subject: Subject;
  studentEmail: string;
  onBack: () => void;
}

type StudyTab = "text" | "pdf";

export function SubjectStudyView({ subject, studentEmail, onBack }: Props) {
  const [tab, setTab]               = useState<StudyTab>("text");
  const [engineReady, setReady]     = useState(false);

  /* ── Book / chapter state ── */
  const [books, setBooks]           = useState<BookMetadata[]>([]);
  const [openBook, setOpenBook]     = useState<BookMetadata | null>(null);
  const [chunks, setChunks]         = useState<TextChunk[]>([]);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);

  /* ── PDF viewer state ── */
  const [pdfUrl, setPdfUrl]         = useState<string | null>(null);
  const [pdfName, setPdfName]       = useState("");

  /* ── AI tutor state ── */
  const [messages, setMessages]     = useState<TutorMessage[]>([]);
  const [input, setInput]           = useState("");
  const [tutorLoading, setTutorLoad] = useState(false);
  const tutorRef   = useRef<AITutor | null>(null);
  const chatRef    = useRef<HTMLDivElement>(null);
  const pdfUrlRef  = useRef<string | null>(null);

  /* ── Init engine + books ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await engine.init();
      if (cancelled) return;
      const allBooks = await engine.getBookList();
      const matched  = allBooks.filter(b => b.subject === subject.name);
      setBooks(matched);
      if (matched.length > 0) {
        const first = matched[0]!;
        setOpenBook(first);
        const cks = await engine.getBookChunks(first.id);
        if (!cancelled) setChunks(cks);
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [subject.name]);

  /* ── Load PDF blob ── */
  useEffect(() => {
    if (!subject.curriculumFileId) return;
    loadCurriculumFile(subject.curriculumFileId).then(asset => {
      if (!asset) return;
      const mimeType = asset.meta.type || "application/pdf";
      const blob     = new Blob([asset.data], { type: mimeType });
      const url      = URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfName(asset.meta.name || "المنهج");
      pdfUrlRef.current = url;
    }).catch(() => {});
    return () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); };
  }, [subject.curriculumFileId]);

  /* ── Init AI tutor ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = engine.createTutor(studentEmail, subject.name);
      await t.init();
      if (cancelled) return;
      tutorRef.current = t;
      const greeting = await t.chat(`مرحباً، أريد المذاكرة في مادة ${subject.name}`);
      if (!cancelled) setMessages([greeting]);
    })();
    return () => { cancelled = true; };
  }, [subject.name, studentEmail]);

  /* ── Auto-scroll chat ── */
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  /* ── Derived: visible paragraphs ── */
  const chapterChunks = chunks.filter(c => c.chapterIndex === chapterIdx);

  /* ── TTS per-paragraph ── */
  const speakParagraph = async (text: string, idx: number) => {
    engine.stopTTS();
    setSpeakingIdx(idx);
    await engine.readAloud(text, {
      rate: 0.88,
      onEnd: () => setSpeakingIdx(null),
    });
    setSpeakingIdx(null);
  };
  const stopSpeaking = () => { engine.stopTTS(); setSpeakingIdx(null); };

  /* ── AI tutor send ── */
  const sendMessage = async () => {
    if (!input.trim() || !tutorRef.current || tutorLoading) return;
    const q = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user" as const, content: q, timestamp: Date.now() }]);
    setTutorLoad(true);
    try {
      const reply = await tutorRef.current.chat(q);
      setMessages(m => [...m, reply]);
      await engine.saveTutorSession(tutorRef.current!.getSession());
    } finally {
      setTutorLoad(false);
    }
  };

  /* ── Switch book ── */
  const switchBook = async (bk: BookMetadata) => {
    stopSpeaking();
    setOpenBook(bk);
    setChapterIdx(0);
    setChunks(await engine.getBookChunks(bk.id));
  };

  const hasPdf      = !!pdfUrl;
  const TABS: { id: StudyTab; icon: string; label: string }[] = [
    { id: "text", icon: "📖", label: "قارئ النصوص" },
    ...(hasPdf ? [{ id: "pdf" as StudyTab, icon: "📄", label: pdfName || "المنهج PDF" }] : []),
  ];

  const card = {
    background: "var(--card)", border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius)", padding: 20,
  } as const;

  /* ── Loading skeleton ── */
  if (!engineReady) return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <button onClick={onBack} style={{ padding: "7px 14px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-muted)", fontFamily: "inherit", fontSize: 13 }}>← رجوع</button>
        <span style={{ fontSize: 30 }}>{subject.icon}</span>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>{subject.name}</h2>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 14 }}>
        <div style={{ width: 44, height: 44, border: "3px solid rgba(108,99,255,0.15)", borderTopColor: "var(--primary)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>جارٍ تحميل محتوى المادة…</span>
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={() => { stopSpeaking(); onBack(); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-muted)", fontFamily: "inherit", fontSize: 13, flexShrink: 0 }}>
          ← رجوع
        </button>

        <span style={{ fontSize: 32, flexShrink: 0 }}>{subject.icon}</span>

        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>{subject.name}</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {subject.voiceProfileId  && <span className="badge badge-success" style={{ fontSize: 10 }}>🎙 شرح صوتي متاح</span>}
            {subject.curriculumFileId && <span className="badge badge-info" style={{ fontSize: 10 }}>📄 {pdfName || "منهج مرفوع"}</span>}
            {books.length > 0 && <span className="badge" style={{ background: "rgba(108,99,255,0.1)", color: "var(--primary)", fontSize: 10 }}>📚 {books.length} كتاب</span>}
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 6 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "7px 14px", background: tab === t.id ? "var(--primary)" : "transparent", border: `1px solid ${tab === t.id ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", color: tab === t.id ? "#fff" : "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: tab === t.id ? 700 : 400 }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PDF Viewer ── */}
      {tab === "pdf" && hasPdf && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: "rgba(108,99,255,0.06)", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>📄</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{pdfName}</span>
            <span className="badge badge-info" style={{ fontSize: 10, marginRight: "auto" }}>📴 محفوظ محلياً</span>
          </div>
          <iframe src={pdfUrl!} title={pdfName}
            style={{ width: "100%", height: 680, border: "none", display: "block" }} />
        </div>
      )}

      {/* ── Text Reader + AI Tutor ── */}
      {tab === "text" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>

          {/* ─ Left: Reader ─ */}
          <div>
            {books.length === 0 ? (
              <div style={{ ...card, textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 52, marginBottom: 14 }}>📖</div>
                <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.8 }}>
                  لم يُضَف محتوى نصي لهذه المادة بعد.<br />
                  {hasPdf
                    ? <>يمكنك الاطلاع على المنهج عبر تبويب <strong style={{ color: "var(--info)" }}>📄 المنهج PDF</strong> أعلاه.</>
                    : <>سيظهر المحتوى هنا فور رفع المعلم للكتاب المدرسي.</>
                  }
                </p>
              </div>
            ) : (
              <div>
                {/* Book selector */}
                {books.length > 1 && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                    {books.map(b => (
                      <button key={b.id} onClick={() => switchBook(b)}
                        style={{ padding: "6px 14px", background: openBook?.id === b.id ? "var(--primary)" : "var(--card)", border: `1px solid ${openBook?.id === b.id ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", color: openBook?.id === b.id ? "#fff" : "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: openBook?.id === b.id ? 700 : 400 }}>
                        {b.title}
                      </button>
                    ))}
                  </div>
                )}

                {openBook && (
                  <div style={card}>
                    {/* Book title */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--glass-border)" }}>
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>{openBook.title}</h3>
                        <span className="badge badge-primary" style={{ fontSize: 10 }}>{openBook.subject}</span>
                      </div>
                      {speakingIdx !== null && (
                        <button onClick={stopSpeaking}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", borderRadius: 20, cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: "var(--danger)", fontWeight: 700, animation: "pulse 1.2s ease-in-out infinite" }}>
                          ⏹ إيقاف القراءة
                        </button>
                      )}
                    </div>

                    {/* Chapter tabs */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center", flexShrink: 0 }}>الفصول:</span>
                      {openBook.chapters.map((ch, i) => (
                        <button key={i} onClick={() => { stopSpeaking(); setChapterIdx(i); }}
                          style={{ padding: "5px 12px", background: chapterIdx === i ? "var(--primary)" : "transparent", border: `1px solid ${chapterIdx === i ? "var(--primary)" : "var(--border)"}`, borderRadius: 20, cursor: "pointer", color: chapterIdx === i ? "#fff" : "var(--text-muted)", fontFamily: "inherit", fontSize: 11, fontWeight: chapterIdx === i ? 700 : 400, transition: "all 0.18s" }}>
                          {i + 1}. {ch.length > 18 ? ch.slice(0, 18) + "…" : ch}
                        </button>
                      ))}
                    </div>

                    {/* Paragraphs with per-paragraph listen buttons */}
                    <div style={{ maxHeight: 560, overflowY: "auto", paddingLeft: 4 }}>
                      {chapterChunks.length === 0 ? (
                        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "30px 0", fontSize: 13 }}>لا يوجد محتوى لهذا الفصل</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          {chapterChunks.map((chunk, i) => {
                            const active = speakingIdx === i;
                            return (
                              <div key={i} style={{ padding: "14px 16px", background: active ? "rgba(108,99,255,0.06)" : "rgba(255,255,255,0.02)", borderRadius: "var(--radius-sm)", border: `1px solid ${active ? "rgba(108,99,255,0.3)" : "var(--glass-border)"}`, transition: "all 0.2s" }}>
                                {/* Paragraph text */}
                                <p style={{ fontSize: 15, lineHeight: 2.1, marginBottom: 12, color: "var(--text)", textAlign: "justify" }}>
                                  {active && <span style={{ display: "inline-flex", width: 8, height: 8, background: "var(--primary)", borderRadius: "50%", marginLeft: 8, animation: "pulse 0.8s ease-in-out infinite", verticalAlign: "middle" }} />}
                                  {chunk.text}
                                </p>

                                {/* Listen button */}
                                <button
                                  onClick={() => active ? stopSpeaking() : speakParagraph(chunk.text, i)}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", background: active ? "rgba(255,71,87,0.1)" : "rgba(0,200,150,0.08)", border: `1px solid ${active ? "var(--danger)" : "var(--success)"}`, borderRadius: 20, cursor: "pointer", fontSize: 11, fontFamily: "inherit", color: active ? "var(--danger)" : "var(--success)", fontWeight: 600, transition: "all 0.2s" }}>
                                  {active ? "⏹ إيقاف" : "🔊 استمع للفقرة"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─ Right: AI Tutor Chatbox ─ */}
          <div style={{ position: "sticky", top: 80 }}>
            <div style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 0 }}>
              {/* Header */}
              <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--glass-border)" }}>
                <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>🤖 مساعد {subject.name}</h4>
                <p style={{ fontSize: 10, color: "var(--text-muted)" }}>RAG محلي • بدون إنترنت • IndexedDB</p>
              </div>

              {/* Messages */}
              <div ref={chatRef} style={{ height: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", paddingTop: 50, fontSize: 12 }}>
                    <div style={{ fontSize: 32, marginBottom: 6 }}>🤖</div>
                    جارٍ تهيئة المساعد…
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-start" : "flex-end" }}>
                    <div style={{
                      maxWidth: "90%", padding: "8px 12px", borderRadius: 10,
                      background: msg.role === "user" ? "rgba(108,99,255,0.12)" : "rgba(0,200,150,0.10)",
                      border: `1px solid ${msg.role === "user" ? "rgba(108,99,255,0.25)" : "rgba(0,200,150,0.25)"}`,
                      fontSize: 12, lineHeight: 1.75, whiteSpace: "pre-wrap",
                    }}>
                      {msg.role === "assistant" && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>🤖 {subject.name}</div>
                      )}
                      {msg.content}
                    </div>
                  </div>
                ))}
                {tutorLoading && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ padding: "8px 12px", background: "rgba(0,200,150,0.08)", border: "1px solid rgba(0,200,150,0.2)", borderRadius: 10, fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ display: "inline-block", animation: "spin 0.8s linear infinite", width: 12, height: 12, border: "2px solid rgba(0,200,150,0.3)", borderTopColor: "var(--success)", borderRadius: "50%" }} />
                      جارٍ التفكير…
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="form-control"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder={`اسأل عن ${subject.name}…`}
                  style={{ flex: 1, fontSize: 12, padding: "8px 12px" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={tutorLoading || !input.trim()}
                  style={{ padding: "8px 14px", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, opacity: tutorLoading || !input.trim() ? 0.5 : 1, transition: "opacity 0.2s" }}>
                  ↑
                </button>
              </div>

              {/* Quick questions */}
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 5 }}>
                {[`اشرح لي الدرس الأول`, `ما أهم المفاهيم؟`, `ساعدني في المراجعة`].map(q => (
                  <button key={q} onClick={() => { setInput(q); }}
                    style={{ padding: "3px 10px", background: "rgba(108,99,255,0.06)", border: "1px solid rgba(108,99,255,0.15)", borderRadius: 20, cursor: "pointer", fontSize: 10, color: "var(--primary)", fontFamily: "inherit" }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
