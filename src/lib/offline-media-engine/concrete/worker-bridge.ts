/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ConcreteWorkerBridge — Main-Thread Proxy to OfflineMediaWorker
 * Part of: HybridRuntime → OfflineMediaEngine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is the CONCRETE implementation of IWorkerBridge (skeleton/worker-bridge.ts).
 *
 * Architecture:
 *
 *   React Component
 *       │  useOfflineMediaEngine() hook
 *       ▼
 *   ConcreteWorkerBridge   ◄── single instance (module-level singleton)
 *       │
 *       ├─ LocalTTSEngine  (main-thread — SpeechSynthesis is window-only)
 *       │     └─ applyVoiceProfile()  ← teacher's BrowserVoiceParams applied here
 *       │
 *       └─ Worker (offline-media.worker.ts)
 *             ├─ KnowledgeStore  (IDB + TF-IDF vector search)
 *             ├─ AITutor         (WASM-based SLM inference)
 *             ├─ Crypto          (SubtleCrypto AES-GCM)
 *             └─ VoiceProfiles   (IDB persistence of teacher voice assets)
 *
 * Message flow:
 *   bridge.chat(...)
 *     → pendingMap.set(requestId, { resolve, reject })
 *     → worker.postMessage({ type: 'ai:chat', requestId, ... })
 *     ← worker.onmessage → handleResponse(resp)
 *         if status==='stream'  → call registered onToken handler
 *         if status==='ok'      → resolve pending promise
 *         if status==='error'   → reject pending promise
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { LocalTTSEngine } from "../tts";
import { saveVoiceProfile, loadVoiceProfile, listVoiceProfiles, seedDemoProfilesIfNeeded }
  from "../voice-profile";
import type { VoiceProfile } from "../voice-profile";
import type {
  IWorkerBridge, WorkerRequest, WorkerResponse,
  InitResponse, KSSearchResponse, WorkerBridgeConfig,
} from "../skeleton/worker-bridge";

/* ── Pending handler maps ─────────────────────────────────────────────── */

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject:  (reason: Error)  => void;
}

interface StreamEntry {
  onToken?: (token: string) => void;
  onWord?:  (word:  string) => void;
  onEnd?:   ()              => void;
  onProgress?: (pct: number, msg: string) => void;
}

/* ── ConcreteWorkerBridge ─────────────────────────────────────────────── */

export class ConcreteWorkerBridge implements IWorkerBridge {
  private _worker:   Worker | null = null;
  private _ready     = false;

  /** Main-thread TTS engine (SpeechSynthesis cannot run in a Worker). */
  private _tts = new LocalTTSEngine();

  /** Active voice profile applied to all TTS calls. */
  private _voiceProfile: VoiceProfile | null = null;

  /** requestId → promise handlers */
  private _pending = new Map<string, PendingEntry>();

  /** requestId → streaming callbacks */
  private _streams = new Map<string, StreamEntry>();

  get isReady(): boolean { return this._ready; }

  /* ── Lifecycle ──────────────────────────────────────────────────────── */

  async init(opts?: { forceBackend?: "webgpu" | "webgl2" | "wasm-cpu" }): Promise<InitResponse> {
    /* Spawn the worker (Vite bundles it as a separate chunk) */
    this._worker = new Worker(
      new URL("../workers/offline-media.worker.ts", import.meta.url),
      { type: "module" },
    );

    this._worker.onmessage = (e: MessageEvent<WorkerResponse & Record<string, unknown>>) => {
      this._handleResponse(e.data);
    };
    this._worker.onerror = (e) => {
      console.error("[OME Worker] error:", e.message);
    };

    /* Initialise TTS on main thread */
    await this._tts.init().catch(() => { /* TTS optional */ });

    /* Seed demo voice profiles (main-thread IDB call as fallback) */
    await seedDemoProfilesIfNeeded().catch(() => { /* non-fatal */ });

    const reqId = this._newId();
    const initResp = await this._send<InitResponse>({
      requestId:    reqId,
      type:         "init",
      forceBackend: opts?.forceBackend,
    });

    this._ready = true;
    return initResp;
  }

  terminate(): void {
    this._tts.stop();
    this._worker?.terminate();
    this._worker  = null;
    this._ready   = false;
    this._pending.clear();
    this._streams.clear();
  }

  /* ── TTS — runs on MAIN THREAD, uses LocalTTSEngine ─────────────────── */

  async speak(
    text: string,
    opts?: { rate?: number; onWord?: (w: string) => void; onEnd?: () => void },
  ): Promise<void> {
    const profile = this._voiceProfile;

    await this._tts.speak(text, {
      rate:   opts?.rate ?? profile?.browserParams.rate   ?? 0.9,
      pitch:  profile?.browserParams.pitch  ?? 1.0,
      volume: profile?.browserParams.volume ?? 1.0,
      voice:  profile?.browserParams.voiceId
        ? { id: profile.browserParams.voiceId, name: profile.browserParams.voiceId,
            lang: profile.meta.language, localService: true }
        : undefined,
      onWord: (w) => opts?.onWord?.(w),
      onEnd:  opts?.onEnd,
    });
  }

  stopTTS():   void { this._tts.stop();   }
  pauseTTS():  void { this._tts.pause();  }
  resumeTTS(): void { this._tts.resume(); }

  /* ── Voice Profile ──────────────────────────────────────────────────── */

  /**
   * Apply a teacher voice profile.
   * The profile's BrowserVoiceParams are applied to every subsequent speak() call.
   * The speakerEmbedding (future ONNX) is persisted to IndexedDB via the Worker.
   */
  async setVoiceProfile(profile: VoiceProfile): Promise<void> {
    this._voiceProfile = profile;
    /* Persist via main-thread IDB (no Worker round-trip needed) */
    await saveVoiceProfile(profile).catch(() => { /* non-fatal */ });
  }

  async loadVoiceProfile(profileId: string): Promise<VoiceProfile | null> {
    const profile = await loadVoiceProfile(profileId).catch(() => null);
    if (profile) this._voiceProfile = profile;
    return profile;
  }

  async listVoiceProfiles(): Promise<VoiceProfile[]> {
    return listVoiceProfiles().catch(() => []);
  }

  get activeVoiceProfile(): VoiceProfile | null { return this._voiceProfile; }

  /* ── KnowledgeStore ─────────────────────────────────────────────────── */

  async ingestBook(
    descriptor: { bookId: string; title: string; subject: string; author: string },
    chapters:   Array<{ title: string; text: string }>,
  ): Promise<void> {
    await this._send({
      requestId: this._newId(),
      type:      "ks:ingestBook",
      ...descriptor,
      chapters,
    });
  }

  async search(query: string, topK = 6): Promise<KSSearchResponse["results"]> {
    const resp = await this._send<KSSearchResponse & { results: KSSearchResponse["results"] }>({
      requestId: this._newId(),
      type:      "ks:search",
      query,
      topK,
    });
    return resp.results ?? [];
  }

  async getBooks(): Promise<unknown[]> {
    const resp = await this._send<{ books: unknown[] }>({
      requestId: this._newId(),
      type:      "ks:getBooks" as WorkerRequest["type"],
    } as WorkerRequest);
    return (resp as { books: unknown[] }).books ?? [];
  }

  /* ── AI / SLM ───────────────────────────────────────────────────────── */

  async loadModel(
    manifestId: string,
    onProgress?: (pct: number, msg: string) => void,
  ): Promise<void> {
    const reqId = this._newId();
    if (onProgress) {
      this._streams.set(reqId, { onProgress });
    }
    await this._send(
      { requestId: reqId, type: "ai:loadModel", manifestId },
      undefined,
      reqId,
    );
    this._streams.delete(reqId);
  }

  async chat(
    sessionId: string,
    message:   string,
    opts?: { stream?: boolean; onToken?: (t: string) => void; useRAG?: boolean },
  ): Promise<string> {
    const reqId = this._newId();

    if (opts?.stream && opts.onToken) {
      this._streams.set(reqId, { onToken: opts.onToken });
    }

    const resp = await this._send<{ fullText: string }>(
      {
        requestId: reqId,
        type:      "ai:chat",
        sessionId,
        message,
        stream:    opts?.stream ?? false,
        useRAG:    opts?.useRAG ?? true,
      },
      undefined,
      reqId,
    );

    this._streams.delete(reqId);
    return resp.fullText ?? "";
  }

  /* ── Vision — Video Digital Twin Engine ─────────────────────────────── */

  /**
   * analyzeFrame
   * ------------
   * Sends a captured video frame + student question to the Worker.
   * The Worker retrieves RAG context from KnowledgeStore, generates an answer
   * via AITutor, and streams tokens back.
   * After receiving the full answer, automatically reads it aloud using the
   * active teacher VoiceProfile via LocalTTSEngine.
   */
  async analyzeFrame(
    imageBase64: string,
    question:    string,
    opts?: {
      sessionId?: string;
      subject?:   string;
      language?:  "ar" | "en";
      useRAG?:    boolean;
      stream?:    boolean;
      onToken?:   (token: string) => void;
    },
  ): Promise<string> {
    const reqId     = this._newId();
    const sessionId = opts?.sessionId ?? `vision_${Date.now()}`;

    if (opts?.stream && opts.onToken) {
      this._streams.set(reqId, { onToken: opts.onToken });
    }

    const resp = await this._send<{ fullText: string; ragUsed: boolean }>(
      {
        requestId:   reqId,
        type:        "vision:analyzeFrame",
        sessionId,
        imageBase64,
        question,
        subject:     opts?.subject,
        language:    opts?.language ?? "ar",
        useRAG:      opts?.useRAG  ?? true,
        stream:      opts?.stream  ?? false,
      } as WorkerRequest,
      [],
      reqId,
    );

    this._streams.delete(reqId);

    const fullAnswer = resp.fullText ?? "";
    /* NOTE: speaking is handled by the caller (VideoPlayerWithCapture / consumer).
       Do NOT auto-speak here to avoid double-TTS. */
    return fullAnswer;
  }

  /* ── Crypto ─────────────────────────────────────────────────────────── */

  async encrypt(plaintext: string): Promise<string> {
    const resp = await this._send<{ result: string }>({
      requestId: this._newId(),
      type:      "crypto:encrypt",
      plaintext,
    });
    return resp.result ?? "";
  }

  async decrypt(blob: { iv: string; data: string; keyId: string }): Promise<string> {
    const resp = await this._send<{ result: string }>({
      requestId: this._newId(),
      type:      "crypto:decrypt",
      ...blob,
    });
    return resp.result ?? "";
  }

  /* ── Internal messaging ─────────────────────────────────────────────── */

  private _send<T = WorkerResponse>(
    request:    WorkerRequest | Record<string, unknown>,
    transfer:   Transferable[] = [],
    streamKey?: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = 30_000;

      const timer = setTimeout(() => {
        this._pending.delete(request.requestId as string);
        reject(new Error(`[OME] timeout for request ${String(request.type)}`));
      }, timeoutMs);

      this._pending.set(request.requestId as string, {
        resolve: (v) => { clearTimeout(timer); resolve(v as T); },
        reject:  (e) => { clearTimeout(timer); reject(e); },
      });

      if (!this._worker) {
        this._pending.delete(request.requestId as string);
        reject(new Error("[OME] Worker not initialised — call init() first"));
        return;
      }

      this._worker.postMessage(request, transfer);
    });
  }

  private _handleResponse(resp: WorkerResponse & Record<string, unknown>): void {
    const { requestId, status } = resp;

    /* Streaming events — don't resolve the pending promise yet */
    if (status === "stream") {
      const entry = this._streams.get(requestId);
      if ("token" in resp && typeof resp.token === "string") {
        entry?.onToken?.(resp.token as string);
      }
      if ("word" in resp && typeof resp.word === "string") {
        entry?.onWord?.(resp.word as string);
      }
      /* Final stream event resolves nothing — wait for the "ok" message */
      return;
    }

    /* Progress events */
    if (status === "progress") {
      const entry = this._streams.get(requestId);
      entry?.onProgress?.(
        (resp as unknown as { pct: number }).pct ?? 0,
        (resp as unknown as { message: string }).message ?? "",
      );
      return;
    }

    /* Terminal events (ok / error) → resolve/reject promise */
    const pending = this._pending.get(requestId);
    if (!pending) return;
    this._pending.delete(requestId);

    if (status === "error") {
      const errorMsg = (resp as unknown as { error?: string }).error ?? "Unknown worker error";
      pending.reject(new Error(errorMsg));
    } else {
      pending.resolve(resp);
    }
  }

  private _newId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/* ── Module-level singleton ──────────────────────────────────────────── */

let _instance: ConcreteWorkerBridge | null = null;

/**
 * Get (or create) the module singleton.
 * Calling this multiple times from different components is safe —
 * they all share the same Worker instance.
 */
export function getWorkerBridge(): ConcreteWorkerBridge {
  if (!_instance) _instance = new ConcreteWorkerBridge();
  return _instance;
}
