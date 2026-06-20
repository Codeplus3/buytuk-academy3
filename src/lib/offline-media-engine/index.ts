/* ─── OfflineMediaEngine — Main Orchestrator ─── */
/* Sandboxed within HybridRuntime, all ops local, no network calls */

import { LocalTTSEngine }      from "./tts";
import { LocalVectorSearch }   from "./vector-search";
import { AITutor }             from "./ai-tutor";
import { CryptoAvailable, generateKey, encrypt, decrypt } from "./crypto";
import { IDBAvailable, storeBook, getAllBookMeta, getChunks, getAllChunks,
         saveTutorSession, getTutorSessions }             from "./idb";
import { SEED_BOOKS }          from "./seed-data";
import type {
  MediaEngineCapabilities, SandboxedContext,
  BookContent, BookMetadata, TextChunk,
  VectorSearchResult, TutorMessage, TutorSession,
  EncryptedBlob,
} from "./types";

export type { MediaEngineCapabilities, SandboxedContext, BookContent, BookMetadata,
              TextChunk, VectorSearchResult, TutorMessage, TutorSession, EncryptedBlob };

export class OfflineMediaEngine {
  private static _instance: OfflineMediaEngine | null = null;

  readonly tts:    LocalTTSEngine;
  readonly search: LocalVectorSearch;

  private _caps:     MediaEngineCapabilities | null = null;
  private _ready     = false;
  private _sessionKey: { key: CryptoKey; keyId: string } | null = null;

  private readonly _sandbox: SandboxedContext = {
    id:          "ome-sandbox",
    origin:      "HybridRuntime::OfflineMediaEngine",
    permissions: ["indexeddb", "tts", "crypto", "webgpu"],
    isolated:    true,
  };

  private constructor() {
    this.tts    = new LocalTTSEngine();
    this.search = new LocalVectorSearch();
  }

  static getInstance(): OfflineMediaEngine {
    if (!OfflineMediaEngine._instance) {
      OfflineMediaEngine._instance = new OfflineMediaEngine();
    }
    return OfflineMediaEngine._instance;
  }

  get ready():   boolean                     { return this._ready; }
  get sandbox(): Readonly<SandboxedContext>  { return this._sandbox; }

  /** Bootstrap — call once on app start */
  async init(): Promise<MediaEngineCapabilities> {
    const [ttsInfo] = await Promise.all([
      this.tts.init(),
      this._ensureSessionKey(),
      this._seedBooksIfNeeded(),
    ]);

    const chunks = await getAllChunks();
    this.search.buildIndex(chunks);

    let gpuStatus: MediaEngineCapabilities["gpu"] = { available: false, backend: "cpu" };
    if ("gpu" in navigator) {
      try {
        const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
        if (adapter) gpuStatus = { available: true, backend: "webgpu", device: "WebGPU" };
      } catch { /* fall through */ }
    }
    if (!gpuStatus.available) {
      const canvas = document.createElement("canvas");
      if (canvas.getContext("webgl2")) gpuStatus = { available: true, backend: "webgl2" };
    }

    this._caps = {
      tts:           this.tts.available,
      ttsVoices:     ttsInfo.voices,
      arabicVoice:   !!this.tts.getBestVoiceForLang("ar"),
      englishVoice:  !!this.tts.getBestVoiceForLang("en"),
      supportedLangs: ttsInfo.languages,
      indexedDB:     IDBAvailable,
      gpu:           gpuStatus,
      crypto:        CryptoAvailable,
      workerThreads: typeof Worker !== "undefined",
    };

    this._ready = true;
    return this._caps!;
  }

  capabilities(): MediaEngineCapabilities | null { return this._caps; }

  /* ─── TTS ─── */
  async readAloud(text: string, opts?: { rate?: number; onWord?: (w: string) => void; onEnd?: () => void }) {
    return this.tts.speak(text, { rate: opts?.rate, onWord: (w) => opts?.onWord?.(w), onEnd: opts?.onEnd });
  }
  stopTTS()  { this.tts.stop();   }
  pauseTTS() { this.tts.pause();  }
  resumeTTS(){ this.tts.resume(); }

  /* ─── Video Digital Twin — Frame analysis ─── */

  /**
   * analyzeVideoFrame
   * -----------------
   * Convenience wrapper for non-React contexts (scripts, other engines).
   * For React components use VideoPlayerWithCapture + ConcreteWorkerBridge.analyzeFrame.
   *
   * Flow:
   *   1. Resize frame to VLM-safe resolution (1344px max) on main thread
   *   2. RAG retrieval from local KnowledgeStore (IndexedDB)
   *   3. AITutor generates a grounded educational answer
   *   4. Answer is read aloud via LocalTTSEngine (teacher voice)
   */
  async analyzeVideoFrame(
    imageBase64: string,
    question:    string,
    opts?: {
      subject?:   string;
      language?:  "ar" | "en";
      useRAG?:    boolean;
      onToken?:   (token: string) => void;
      onAnswer?:  (answer: string) => void;
    },
  ): Promise<string> {
    /* Step 1 — Resize frame */
    let processedFrame = imageBase64;
    try {
      const { LocalVisionEngine } = await import("./skeleton/local-vision-engine");
      processedFrame = await LocalVisionEngine.resizeFrame(imageBase64, 1344);
    } catch { /* non-fatal — use original */ }

    /* Step 2 — RAG retrieval */
    let ragContext = "";
    if (opts?.useRAG !== false) {
      try {
        const chunks = await getAllChunks();
        if (chunks.length > 0) {
          const { LocalVectorSearch } = await import("./vector-search");
          const vs = new LocalVectorSearch();
          vs.buildIndex(chunks);
          const hits = vs.search(question, 4);
          ragContext  = hits.map(h => h.text).join("\n---\n");
        }
      } catch { /* non-fatal */ }
    }

    /* Step 3 — AITutor answer */
    const isArabic   = (opts?.language ?? "ar") === "ar";
    const subject     = opts?.subject ?? "عام";
    const prompt      = isArabic
      ? `[سؤال الطالب عن لقطة الفيديو — مادة: ${subject}]\n${question}${ragContext ? `\n\n[سياق ذو صلة]\n${ragContext}` : ""}`
      : `[Student question about video frame — subject: ${subject}]\n${question}${ragContext ? `\n\n[Relevant context]\n${ragContext}` : ""}`;

    const tutor  = new AITutor("student", subject, this.search);
    const msg    = await tutor.chat(prompt);
    const answer = msg.content;

    /* Step 4 — Read aloud with teacher voice */
    await this.tts.speak(answer, {
      lang:  opts?.language,
      onEnd: () => opts?.onAnswer?.(answer),
    });

    opts?.onToken?.(answer);
    return answer;
  }

  /* ─── Books ─── */
  async getBookList(): Promise<BookMetadata[]> { return getAllBookMeta(); }

  async getBookChunks(bookId: string): Promise<TextChunk[]> { return getChunks(bookId); }

  /* ─── Vector Search ─── */
  semanticSearch(query: string, topK = 6): VectorSearchResult[] {
    return this.search.search(query, topK);
  }

  /* ─── AI Tutor ─── */
  createTutor(studentEmail: string, subject: string): AITutor {
    return new AITutor(studentEmail, subject, this.search);
  }

  /**
   * rebuildSearchIndex
   * ------------------
   * Reload ALL chunks from IndexedDB and rebuild the TF-IDF search index.
   * Call this after storing new video-analysis chunks so the AITutor
   * (which shares `this.search`) can find them immediately.
   */
  async rebuildSearchIndex(): Promise<void> {
    const allChunks = await getAllChunks();
    this.search.buildIndex(allChunks);
  }

  async saveTutorSession(session: TutorSession): Promise<void> {
    await saveTutorSession(session);
  }

  async getTutorHistory(studentEmail: string): Promise<TutorSession[]> {
    return getTutorSessions(studentEmail);
  }

  /* ─── Crypto ─── */
  async encryptText(text: string): Promise<EncryptedBlob> {
    await this._ensureSessionKey();
    const { key, keyId } = this._sessionKey!;
    return encrypt(text, key, keyId);
  }

  async decryptText(blob: EncryptedBlob): Promise<string> {
    await this._ensureSessionKey();
    return decrypt(blob, this._sessionKey!.key);
  }

  /* ─── Private helpers ─── */
  private async _ensureSessionKey(): Promise<void> {
    if (this._sessionKey || !CryptoAvailable) return;
    this._sessionKey = await generateKey();
  }

  private async _seedBooksIfNeeded(): Promise<void> {
    const existing = await getAllBookMeta();
    if (existing.length > 0) return;
    for (const book of SEED_BOOKS) {
      await storeBook(book);
    }
  }
}

/* Re-export sub-modules for direct use */
export { LocalTTSEngine }    from "./tts";
export { LocalVectorSearch } from "./vector-search";
export { AITutor }           from "./ai-tutor";
export { CryptoAvailable, generateKey, encrypt, decrypt } from "./crypto";
export { IDBAvailable }      from "./idb";
