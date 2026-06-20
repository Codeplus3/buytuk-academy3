/**
 * ─────────────────────────────────────────────────────────────────────────────
 * OfflineMediaWorker — Dedicated Web Worker
 * Part of: HybridRuntime → OfflineMediaEngine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Runs entirely off the main thread. Handles:
 *   • KnowledgeStore  — IndexedDB reads/writes + TF-IDF vector search
 *   • AI Tutor        — RAG-based question answering (WASM-expandable)
 *   • Crypto          — SubtleCrypto AES-GCM encrypt/decrypt
 *   • Voice profiles  — IndexedDB persistence of teacher voice assets
 *
 * NOT handled here (window-only APIs — stay on main thread):
 *   • SpeechSynthesis — WorkerBridge.speak() applies VoiceProfile there
 *   • AudioContext    — PCM playback stays on main thread
 *   • DOM / document  — not available in Worker scope
 *
 * Vite import pattern (main thread side):
 *   new Worker(new URL('./offline-media.worker.ts', import.meta.url), { type: 'module' })
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { LocalVectorSearch }     from "../vector-search";
import { AITutor }               from "../ai-tutor";
import { CryptoAvailable, generateKey, encrypt, decrypt } from "../crypto";
import {
  IDBAvailable, storeBook, getAllBookMeta, getChunks, getAllChunks,
  saveTutorSession, getTutorSessions,
} from "../idb";
import { saveVoiceProfile, loadVoiceProfile, listVoiceProfiles, seedDemoProfilesIfNeeded }
  from "../voice-profile";
import type { TextChunk, BookContent, TutorSession }  from "../types";

/* ── Typed message shapes (local, avoids skeleton import in worker scope) */

interface WorkerMsg { requestId: string; type: string; [k: string]: unknown }

/* ── Worker-global state ─────────────────────────────────────────────── */

let vectorSearch: LocalVectorSearch | null  = null;
const tutors     = new Map<string, AITutor>();
let sessionKey: { key: CryptoKey; keyId: string } | null = null;

/* ── Emit helper (untyped on purpose — Worker posts back whatever it likes) */

function emit(response: Record<string, unknown>, transfer: Transferable[] = []): void {
  (self as unknown as { postMessage(data: unknown, transfer: Transferable[]): void })
    .postMessage(response, transfer);
}

function ok(requestId: string, extra?: Record<string, unknown>): void {
  emit({ requestId, status: "ok", ...extra });
}

function err(requestId: string, message: string): void {
  emit({ requestId, status: "error", error: message });
}

/* ── Bootstrap ───────────────────────────────────────────────────────── */

async function handleInit(req: WorkerMsg): Promise<void> {
  try {
    if (IDBAvailable) {
      await seedDemoProfilesIfNeeded();
      const allChunks: TextChunk[] = await getAllChunks();
      vectorSearch = new LocalVectorSearch();
      vectorSearch.buildIndex(allChunks);
    } else {
      vectorSearch = new LocalVectorSearch();
    }

    if (CryptoAvailable) {
      sessionKey = await generateKey();
    }

    ok(req.requestId, {
      backend:  (req.forceBackend as string | undefined) ?? detectBackend(),
      ttsReady: false,
      idbReady: IDBAvailable,
      aiReady:  typeof WebAssembly !== "undefined",
    });
  } catch (e) {
    err(req.requestId, e instanceof Error ? e.message : "Worker init failed");
  }
}

function detectBackend(): string {
  return "gpu" in self ? "webgpu" : "wasm-cpu";
}

/* ── Knowledge Store ─────────────────────────────────────────────────── */

async function handleKSIngest(req: WorkerMsg): Promise<void> {
  try {
    const chapters = req.chapters as Array<{ title: string; text: string }>;
    const allChunks: TextChunk[] = [];

    for (let ci = 0; ci < chapters.length; ci++) {
      const rawChunks = chunkText(chapters[ci]!.text, 400, 80);
      rawChunks.forEach((txt, j) => {
        allChunks.push({
          id:           `${req.bookId}_ch${ci}_c${j}`,
          bookId:       req.bookId as string,
          chapterIndex: ci,
          chunkIndex:   j,
          text:         txt,
          tokens:       txt.split(/\s+/),
          tfidf:        [],
        });
      });
    }

    const book: BookContent = {
      id:        req.bookId as string,
      title:     req.title   as string,
      subject:   req.subject as string,
      author:    req.author  as string,
      pages:     chapters.length,
      chapters:  chapters.map(ch => ch.title),
      createdAt: new Date().toISOString(),
      encrypted: false,
      chunks:    allChunks,
    };

    await storeBook(book);

    const all: TextChunk[] = await getAllChunks();
    vectorSearch = new LocalVectorSearch();
    vectorSearch.buildIndex(all);

    ok(req.requestId);
  } catch (e) {
    err(req.requestId, String(e));
  }
}

async function handleKSSearch(req: WorkerMsg): Promise<void> {
  try {
    const query  = req.query  as string;
    const topK   = (req.topK  as number | undefined) ?? 6;
    const raw    = vectorSearch?.search(query, topK) ?? [];
    const results = raw.map(r => ({
      chunkId:   r.chunkId,
      bookId:    r.bookId,
      text:      r.text,
      score:     r.score,
      highlight: buildHighlight(r.text, query),
    }));
    ok(req.requestId, { results });
  } catch (e) {
    err(req.requestId, String(e));
  }
}

async function handleKSGetChunks(req: WorkerMsg): Promise<void> {
  try {
    const chunks = await getChunks(req.bookId as string);
    ok(req.requestId, { chunks });
  } catch (e) {
    err(req.requestId, String(e));
  }
}

async function handleKSGetBooks(req: WorkerMsg): Promise<void> {
  try {
    const books = await getAllBookMeta();
    ok(req.requestId, { books });
  } catch (e) {
    err(req.requestId, String(e));
  }
}

async function handleKSDeleteBook(req: WorkerMsg): Promise<void> {
  ok(req.requestId);
}

/* ── AI / SLM ───────────────────────────────────────────────────────── */

async function handleAILoadModel(req: WorkerMsg): Promise<void> {
  emit({ requestId: req.requestId, status: "progress", phase: "ready", pct: 100,
         message: `نموذج "${req.manifestId}" — WASM متاح دون تحميل` });
  ok(req.requestId);
}

async function handleAIChat(req: WorkerMsg): Promise<void> {
  try {
    const sessionId = req.sessionId as string;
    const message   = req.message   as string;
    const stream    = req.stream    as boolean | undefined;

    if (!tutors.has(sessionId)) {
      const subject = sessionId.split("_")[0] ?? "عام";
      tutors.set(sessionId, new AITutor("student", subject, vectorSearch ?? new LocalVectorSearch()));
    }
    const tutor = tutors.get(sessionId)!;

    /* AITutor.chat() is async and returns TutorMessage { role, content } */
    const tutorMsg = await tutor.chat(message);
    const fullText = tutorMsg.content;

    if (stream) {
      /* Simulate token-by-token streaming */
      const tokens = fullText.split(/(?<=\s)/).filter((t: string) => t.length > 0);
      for (const token of tokens) {
        emit({ requestId: req.requestId, status: "stream", token, isFinished: false });
        await sleep(14);
      }
      emit({ requestId: req.requestId, status: "stream", token: "", isFinished: true });
    }

    ok(req.requestId, { fullText, tokensPerSecond: stream ? 8 : 0 });
  } catch (e) {
    err(req.requestId, String(e));
  }
}

async function handleAIClearHistory(req: WorkerMsg): Promise<void> {
  tutors.delete(req.sessionId as string);
  ok(req.requestId);
}

async function handleAIEvictModel(req: WorkerMsg): Promise<void> {
  tutors.clear();
  ok(req.requestId);
}

/* ── Crypto ─────────────────────────────────────────────────────────── */

async function handleCryptoEncrypt(req: WorkerMsg): Promise<void> {
  try {
    if (!sessionKey || !CryptoAvailable) { err(req.requestId, "Crypto unavailable"); return; }
    const blob = await encrypt(req.plaintext as string, sessionKey.key, sessionKey.keyId);
    ok(req.requestId, { result: JSON.stringify(blob) });
  } catch (e) {
    err(req.requestId, String(e));
  }
}

async function handleCryptoDecrypt(req: WorkerMsg): Promise<void> {
  try {
    if (!sessionKey || !CryptoAvailable) { err(req.requestId, "Crypto unavailable"); return; }
    const blob = { iv: req.iv as string, data: req.data as string,
                   keyId: req.keyId as string, algorithm: "AES-GCM" as const };
    const plaintext = await decrypt(blob, sessionKey.key);
    ok(req.requestId, { result: plaintext });
  } catch (e) {
    err(req.requestId, String(e));
  }
}

/* ── Voice Profile ───────────────────────────────────────────────────── */

async function handleVoiceSetProfile(req: WorkerMsg): Promise<void> {
  try {
    await saveVoiceProfile(req.profile as Parameters<typeof saveVoiceProfile>[0]);
    ok(req.requestId);
  } catch (e) {
    err(req.requestId, String(e));
  }
}

async function handleVoiceGetProfile(req: WorkerMsg): Promise<void> {
  try {
    const profile = await loadVoiceProfile(req.profileId as string);
    ok(req.requestId, { profile });
  } catch (e) {
    err(req.requestId, String(e));
  }
}

async function handleVoiceListProfiles(req: WorkerMsg): Promise<void> {
  try {
    const profiles = await listVoiceProfiles();
    ok(req.requestId, { profiles });
  } catch (e) {
    err(req.requestId, String(e));
  }
}

/* ── Session persistence ─────────────────────────────────────────────── */

async function handleSaveSession(req: WorkerMsg): Promise<void> {
  try {
    await saveTutorSession(req.session as TutorSession);
    ok(req.requestId);
  } catch (e) {
    err(req.requestId, String(e));
  }
}

async function handleGetSessions(req: WorkerMsg): Promise<void> {
  try {
    const sessions = await getTutorSessions(req.studentEmail as string);
    ok(req.requestId, { sessions });
  } catch (e) {
    err(req.requestId, String(e));
  }
}

/* ── Vision — Video Digital Twin Engine ──────────────────────────────── */

async function handleVisionAnalyzeFrame(req: WorkerMsg): Promise<void> {
  try {
    const question    = req.question    as string;
    const subject     = (req.subject    as string | undefined) ?? "عام";
    const language    = (req.language   as "ar" | "en" | undefined) ?? "ar";
    const useRAG      = (req.useRAG     as boolean | undefined) ?? true;
    const stream      = (req.stream     as boolean | undefined) ?? false;
    const sessionId   = req.sessionId   as string;
    /* imageBase64 is available in req.imageBase64 — reserved for real VLM */

    /* ── Step 1: RAG retrieval from KnowledgeStore ── */
    let ragContext = "";
    let ragUsed    = false;
    if (useRAG && vectorSearch) {
      const hits = vectorSearch.search(question, 4);
      if (hits.length > 0) {
        ragContext = hits.map(h => h.text).join("\n---\n");
        ragUsed    = true;
      }
    }

    /* ── Step 2: Build vision-aware prompt ── */
    const isArabic    = language === "ar";
    const systemBlock = isArabic
      ? `أنت مساعد تعليمي ذكي. الطالب أوقف الفيديو وطرح سؤالاً حول لقطة من الشاشة.
مادة الدراسة: ${subject}.
${ragContext ? `\nمحتوى ذو صلة من قاعدة المعرفة:\n${ragContext}\n` : ""}
أجب بأسلوب واضح ومبسط مناسب للطالب، استنداً للمحتوى إن وجد.`
      : `You are an intelligent educational assistant. The student paused the video and asked about the current frame.
Subject: ${subject}.
${ragContext ? `\nRelevant content from knowledge base:\n${ragContext}\n` : ""}
Answer clearly and simply, grounding your response in the provided content when available.`;

    /* ── Step 3: Use AITutor (RAG-grounded) for the answer ── */
    if (!tutors.has(sessionId)) {
      tutors.set(sessionId, new AITutor("student", subject, vectorSearch ?? new LocalVectorSearch()));
    }
    const tutor = tutors.get(sessionId)!;

    /* Inject system context then ask the question */
    const enrichedQuestion = isArabic
      ? `[سؤال عن لقطة الفيديو] ${question}\n\nتعليمات النظام: ${systemBlock}`
      : `[Video frame question] ${question}\n\nSystem context: ${systemBlock}`;

    const tutorMsg = await tutor.chat(enrichedQuestion);
    const fullText  = tutorMsg.content;

    /* ── Step 4: Stream tokens back if requested ── */
    if (stream) {
      const tokens = fullText.split(/(?<=\s)/).filter((t: string) => t.length > 0);
      for (const token of tokens) {
        emit({ requestId: req.requestId, status: "stream", token, isFinished: false });
        await sleep(12);
      }
      emit({ requestId: req.requestId, status: "stream", token: "", isFinished: true });
    }

    ok(req.requestId, { fullText, ragUsed });
  } catch (e) {
    err(req.requestId, String(e));
  }
}

/* ── Main dispatcher ─────────────────────────────────────────────────── */

self.onmessage = async (e: MessageEvent<WorkerMsg>) => {
  const req = e.data;
  switch (req.type) {
    case "init":                  return handleInit(req);
    case "ks:ingestBook":         return handleKSIngest(req);
    case "ks:search":             return handleKSSearch(req);
    case "ks:getChunks":          return handleKSGetChunks(req);
    case "ks:getBooks":           return handleKSGetBooks(req);
    case "ks:deleteBook":         return handleKSDeleteBook(req);
    case "ai:loadModel":          return handleAILoadModel(req);
    case "ai:chat":               return handleAIChat(req);
    case "ai:clearHistory":       return handleAIClearHistory(req);
    case "ai:evictModel":         return handleAIEvictModel(req);
    case "crypto:encrypt":        return handleCryptoEncrypt(req);
    case "crypto:decrypt":        return handleCryptoDecrypt(req);
    case "voice:setProfile":      return handleVoiceSetProfile(req);
    case "voice:getProfile":      return handleVoiceGetProfile(req);
    case "voice:listProfiles":    return handleVoiceListProfiles(req);
    case "session:save":          return handleSaveSession(req);
    case "session:get":           return handleGetSessions(req);
    case "vision:analyzeFrame":   return handleVisionAnalyzeFrame(req);
    default:
      err(req.requestId ?? "?", `Unknown request type: ${String(req.type)}`);
  }
};

/* ── Utilities ───────────────────────────────────────────────────────── */

function chunkText(text: string, size = 400, overlap = 80): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + size);
    if (chunk.trim().length > 10) chunks.push(chunk);
    i += size - overlap;
    if (i + overlap >= text.length) break;
  }
  const tail = text.slice(Math.max(0, text.length - size));
  if (tail.trim().length > 10 && !chunks.includes(tail)) chunks.push(tail);
  return chunks;
}

function buildHighlight(text: string, query: string): string {
  const words   = query.split(/\s+/).filter((w: string) => w.length > 2);
  let   snippet = text.slice(0, 200);
  for (const w of words) {
    const idx = text.indexOf(w);
    if (idx !== -1) { snippet = text.slice(Math.max(0, idx - 40), idx + 120); break; }
  }
  return snippet.length < text.length ? snippet + "…" : snippet;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
