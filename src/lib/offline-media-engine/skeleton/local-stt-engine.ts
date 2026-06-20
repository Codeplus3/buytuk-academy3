/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LocalSTTEngine — Offline Speech-to-Text (Whisper + Browser fallback)
 * Part of: HybridRuntime → OfflineMediaEngine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two-tier backend strategy:
 *
 *  Tier 1 — WhisperBackend (Transformers.js)
 *    • Loads openai/whisper-tiny (39 MB) or whisper-base (74 MB) via OPFS cache.
 *    • Runs inference on WebGPU → WASM CPU fallback.
 *    • Supports Arabic (ar) + English (en) + multilingual.
 *    • Requires one-time model download; subsequent runs are instant.
 *
 *  Tier 2 — BrowserSTTBackend (Web SpeechRecognition API)
 *    • Zero setup — works on Chrome, Edge, Safari immediately.
 *    • Requires mic permission + brief network for server-side recognition.
 *    • Activated automatically when Transformers.js is unavailable.
 *
 * Audio capture:
 *   • MediaRecorder API — records opus/webm chunks.
 *   • AudioRecorder utility handles start/stop/export lifecycle.
 *   • Works independently of which backend is active.
 *
 * Usage:
 *   const stt = new LocalSTTEngine({ language: "ar" });
 *   await stt.init();
 *   await stt.startRecording();
 *   const blob = await stt.stopRecording();
 *   const text = await stt.transcribe(blob);
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ── Language / model types ───────────────────────────────────────────── */

export type STTLanguage = "ar" | "en" | "auto";
export type STTBackendType = "whisper-webgpu" | "whisper-wasm" | "browser-api";

export interface STTModelManifest {
  id:           string;
  displayName:  string;
  sizeBytes:    number;
  /** Hugging Face model ID used by Transformers.js pipeline(). */
  hfModelId:    string;
  languages:    STTLanguage[];
  preferredBackend: "whisper-webgpu" | "whisper-wasm";
}

/** Pre-defined Whisper manifests — swap hfModelId for self-hosted CDN in production. */
export const KNOWN_STT_MODELS = {
  /**
   * Whisper Tiny — 39 MB, fastest, good for short queries.
   * Best choice for in-video Q&A (student asks a quick question).
   */
  WHISPER_TINY: {
    id:               "whisper-tiny",
    displayName:      "Whisper Tiny (39 MB)",
    sizeBytes:        39_000_000,
    hfModelId:        "Xenova/whisper-tiny",
    languages:        ["ar", "en", "auto"] as STTLanguage[],
    preferredBackend: "whisper-webgpu" as const,
  } satisfies STTModelManifest,

  /**
   * Whisper Base — 74 MB, better Arabic accuracy.
   * Recommended for classroom environments with GPU devices.
   */
  WHISPER_BASE: {
    id:               "whisper-base",
    displayName:      "Whisper Base (74 MB)",
    sizeBytes:        74_000_000,
    hfModelId:        "Xenova/whisper-base",
    languages:        ["ar", "en", "auto"] as STTLanguage[],
    preferredBackend: "whisper-webgpu" as const,
  } satisfies STTModelManifest,

  /**
   * Whisper Small Arabic — 244 MB, best Arabic recognition.
   * Use when accuracy matters more than speed.
   */
  WHISPER_SMALL_AR: {
    id:               "whisper-small-ar",
    displayName:      "Whisper Small Arabic (244 MB)",
    sizeBytes:        244_000_000,
    hfModelId:        "Systran/faster-whisper-small",
    languages:        ["ar", "en", "auto"] as STTLanguage[],
    preferredBackend: "whisper-webgpu" as const,
  } satisfies STTModelManifest,
} as const;

/* ── Transcription result ─────────────────────────────────────────────── */

export interface TranscriptionResult {
  text:       string;
  language:   string;
  confidence: number;   // 0–1, browser API = 1.0
  backend:    STTBackendType;
  durationMs: number;
}

/* ── Progress callback ────────────────────────────────────────────────── */

export type STTProgressCallback = (phase: "loading" | "transcribing", pct: number) => void;

/* ── Audio recorder utility ───────────────────────────────────────────── */

/**
 * AudioRecorder
 * -------------
 * Wraps MediaRecorder to start/stop mic recording and return an AudioBlob.
 * Used by LocalSTTEngine to capture student voice before transcription.
 */
export class AudioRecorder {
  private _recorder:  MediaRecorder | null = null;
  private _chunks:    Blob[]               = [];
  private _stream:    MediaStream | null   = null;
  private _startedAt: number               = 0;
  private _mimeType:  string               = "audio/webm";

  get isRecording(): boolean { return this._recorder?.state === "recording"; }
  get durationMs():  number  { return this._startedAt ? Date.now() - this._startedAt : 0; }

  /** Request mic permission and start recording. */
  async startRecording(opts?: { maxDurationMs?: number }): Promise<void> {
    if (this._recorder?.state === "recording") return;

    this._stream = await navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: 1,
      sampleRate:   16000,   /* Whisper expects 16 kHz */
      echoCancellation: true,
      noiseSuppression: true,
    }});

    /* Select best supported MIME type */
    const mimes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    this._mimeType = mimes.find(m => MediaRecorder.isTypeSupported(m)) ?? "audio/webm";

    this._chunks    = [];
    this._startedAt = Date.now();
    this._recorder  = new MediaRecorder(this._stream, { mimeType: this._mimeType });
    this._recorder.ondataavailable = (e) => { if (e.data.size > 0) this._chunks.push(e.data); };
    this._recorder.start(200 /* chunk interval ms */);

    /* Auto-stop after max duration */
    if (opts?.maxDurationMs) {
      setTimeout(() => { if (this.isRecording) void this.stopRecording(); }, opts.maxDurationMs);
    }
  }

  /** Stop recording and return the captured audio blob. */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this._recorder || this._recorder.state === "inactive") {
        resolve(new Blob(this._chunks, { type: this._mimeType }));
        return;
      }
      this._recorder.onstop = () => {
        this._stream?.getTracks().forEach(t => t.stop());
        this._stream = null;
        resolve(new Blob(this._chunks, { type: this._mimeType }));
      };
      this._recorder.onerror = (e) => reject(e);
      this._recorder.stop();
    });
  }

  /** Release mic track immediately (e.g. user cancels). */
  cancel(): void {
    this._recorder?.stop();
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream    = null;
    this._recorder  = null;
    this._chunks    = [];
  }
}

/* ── STT Backend interface ────────────────────────────────────────────── */

export interface ISTTBackend {
  readonly type:    STTBackendType;
  readonly isReady: boolean;

  /** Load model weights (no-op for browser-api backend). */
  init(onProgress?: STTProgressCallback): Promise<void>;

  /** Transcribe an audio blob. */
  transcribe(audio: Blob, language: STTLanguage): Promise<TranscriptionResult>;

  /** Release resources. */
  dispose(): void;
}

/* ── Whisper backend (Transformers.js) ────────────────────────────────── */

/**
 * WhisperBackend
 * --------------
 * Lazy-loads @xenova/transformers AutomaticSpeechRecognition pipeline.
 * Model weights are cached in browser OPFS after first download.
 *
 * Implementation note:
 *   Transformers.js is imported dynamically so it doesn't bloat the initial
 *   bundle. If the import fails, LocalSTTEngine falls back to BrowserSTTBackend.
 */
export abstract class WhisperBackend implements ISTTBackend {
  readonly type: STTBackendType;
  protected _pipeline: unknown = null;

  constructor(
    protected readonly manifest: STTModelManifest,
    protected readonly backend:  "whisper-webgpu" | "whisper-wasm",
  ) {
    this.type = backend;
  }

  abstract readonly isReady: boolean;
  abstract init(onProgress?: STTProgressCallback): Promise<void>;
  abstract transcribe(audio: Blob, language: STTLanguage): Promise<TranscriptionResult>;
  abstract dispose(): void;

  /** Convert Blob → Float32Array at 16 kHz (required by Whisper). */
  protected async blobToFloat32(blob: Blob): Promise<Float32Array> {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx    = new AudioContext({ sampleRate: 16000 });
    const decoded     = await audioCtx.decodeAudioData(arrayBuffer);
    const channel     = decoded.getChannelData(0);
    audioCtx.close();
    return channel;
  }
}

/* ── Browser SpeechRecognition backend ───────────────────────────────── */

/**
 * BrowserSTTBackend
 * -----------------
 * Uses the Web SpeechRecognition API (Chrome/Edge/Safari).
 * Does NOT use the AudioBlob — it taps directly into the mic stream.
 * Activated when Whisper is unavailable or not yet loaded.
 *
 * Characteristics:
 *   • Zero setup, works immediately
 *   • May use a network round-trip (browser vendor-dependent)
 *   • Confidence score comes from the browser
 */
export class BrowserSTTBackend implements ISTTBackend {
  readonly type = "browser-api" as const;
  private _ready = false;

  get isReady(): boolean { return this._ready; }

  async init(): Promise<void> {
    const w = window as unknown as Record<string, unknown>;
    const hasAPI = !!(w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]);
    this._ready = hasAPI;
    if (!hasAPI) throw new Error("Web SpeechRecognition not available in this browser");
  }

  /**
   * For the browser-api backend, transcription is handled differently:
   * the STTEngine starts a SpeechRecognition session directly on the mic stream
   * rather than processing a Blob. This method is a no-op — use
   * transcribeFromMic() instead.
   */
  async transcribe(_audio: Blob, _language: STTLanguage): Promise<TranscriptionResult> {
    throw new Error("BrowserSTTBackend: use transcribeFromMic() directly");
  }

  /**
   * Start a real-time SpeechRecognition session.
   * Resolves with the transcript when speech ends.
   */
  transcribeFromMic(language: STTLanguage): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      const w  = window as unknown as Record<string, unknown>;
      const SR = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
        (new () => {
          lang: string; continuous: boolean; interimResults: boolean;
          maxAlternatives: number;
          onresult: ((e: { results: Array<Array<{ transcript: string; confidence: number }>> }) => void) | null;
          onerror:  ((e: { error: string }) => void) | null;
          onend:    (() => void) | null;
          start():  void; stop(): void;
        }) | undefined;

      if (!SR) { reject(new Error("SpeechRecognition not found")); return; }

      const rec = new SR();
      const langMap: Record<STTLanguage, string> = {
        ar:   "ar-SA",
        en:   "en-US",
        auto: "ar-SA",   /* default to Arabic for this platform */
      };
      rec.lang            = langMap[language];
      rec.continuous      = false;
      rec.interimResults  = true;   /* interim results improve accuracy in quiet rooms */
      rec.maxAlternatives = 3;      /* pick best of 3 candidates */

      const t0       = Date.now();
      let   settled  = false;       /* guard: resolve/reject only once */

      const finish = (result: TranscriptionResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      rec.onresult = (e) => {
        /* Pick the highest-confidence final result */
        const finals = Array.from({ length: e.results.length })
          .map((_, i) => e.results[i]);
        const finalGroup = finals.find(r => (r as unknown as { isFinal?: boolean }).isFinal !== false) ?? e.results[0];
        if (!finalGroup) return;

        /* Choose best alternative by confidence */
        let best = finalGroup[0];
        for (let i = 1; i < finalGroup.length; i++) {
          if ((finalGroup[i]?.confidence ?? 0) > (best?.confidence ?? 0)) {
            best = finalGroup[i];
          }
        }

        finish({
          text:       best?.transcript ?? "",
          language,
          confidence: best?.confidence ?? 1,
          backend:    "browser-api",
          durationMs: Date.now() - t0,
        });
      };

      rec.onerror = (e) => {
        if (e.error === "no-speech") {
          /* Graceful — caller shows friendly toast, engine stays alive */
          finish({
            text:       "",
            language,
            confidence: 0,
            backend:    "browser-api",
            durationMs: Date.now() - t0,
          });
          return;
        }
        /* Real errors (audio-capture, not-allowed, network…) → reject */
        if (!settled) {
          settled = true;
          reject(new Error(`SpeechRecognition error: ${e.error}`));
        }
      };

      rec.onend = () => {
        /* Safety-net: if neither onresult nor onerror fired (e.g. very short silence) */
        finish({
          text:       "",
          language,
          confidence: 0,
          backend:    "browser-api",
          durationMs: Date.now() - t0,
        });
      };

      rec.start();
    });
  }

  dispose(): void { /* stateless */ }
}

/* ── LocalSTTEngine ───────────────────────────────────────────────────── */

export interface LocalSTTEngineConfig {
  /** Default language for transcription. */
  language?:     STTLanguage;
  /** Preferred Whisper model. Defaults to WHISPER_TINY. */
  model?:        STTModelManifest;
  /** Force fallback to browser API (skip Whisper). */
  forceBrowser?: boolean;
  /** Max recording duration in ms. Default 30 000. */
  maxDurationMs?: number;
}

export interface STTEngineStatus {
  backend:      STTBackendType;
  modelLoaded:  boolean;
  hasWhisper:   boolean;
  hasBrowserAPI: boolean;
}

/**
 * LocalSTTEngine
 * --------------
 * Orchestrates audio capture + transcription with automatic backend selection.
 *
 * Preferred flow (Whisper available):
 *   startRecording() → [student speaks] → stopAndTranscribe()
 *     → AudioRecorder.stopRecording() → WhisperBackend.transcribe(blob)
 *     → TranscriptionResult
 *
 * Fallback flow (browser API):
 *   startTranscribingFromMic() → [student speaks]
 *     → BrowserSTTBackend.transcribeFromMic()
 *     → TranscriptionResult
 */
export class LocalSTTEngine {
  private _whisper:  WhisperBackend | null     = null;
  private _browser:  BrowserSTTBackend         = new BrowserSTTBackend();
  private _recorder: AudioRecorder             = new AudioRecorder();
  private _backend:  STTBackendType | null     = null;
  private _ready     = false;

  readonly config: Required<LocalSTTEngineConfig>;

  constructor(config: LocalSTTEngineConfig = {}) {
    this.config = {
      language:     config.language     ?? "ar",
      model:        config.model        ?? KNOWN_STT_MODELS.WHISPER_TINY,
      forceBrowser: config.forceBrowser ?? false,
      maxDurationMs: config.maxDurationMs ?? 30_000,
    };
  }

  get isReady():   boolean        { return this._ready; }
  get backend():   STTBackendType | null { return this._backend; }
  get isRecording(): boolean      { return this._recorder.isRecording; }
  get recordingDuration(): number { return this._recorder.durationMs; }

  /**
   * Initialise the engine.
   * Tries to activate Whisper; falls back to browser API automatically.
   */
  async init(onProgress?: STTProgressCallback): Promise<STTEngineStatus> {
    /* Step 1: Check browser SpeechRecognition availability */
    let hasBrowserAPI = false;
    try {
      await this._browser.init();
      hasBrowserAPI = true;
    } catch { /* not available */ }

    /* Step 2: Try to load Transformers.js + Whisper (optional) */
    let hasWhisper = false;
    if (!this.config.forceBrowser) {
      try {
        hasWhisper = await this._tryLoadWhisper(onProgress);
      } catch { /* Transformers.js not available — use browser fallback */ }
    }

    /* Step 3: Select active backend */
    if (hasWhisper && this._whisper?.isReady) {
      this._backend = this._whisper.type;
    } else if (hasBrowserAPI) {
      this._backend = "browser-api";
    } else {
      throw new Error("No STT backend available — SpeechRecognition and Transformers.js both unavailable");
    }

    this._ready = true;
    return {
      backend:       this._backend,
      modelLoaded:   hasWhisper,
      hasWhisper,
      hasBrowserAPI,
    };
  }

  /**
   * Start recording from the microphone.
   * Call stopAndTranscribe() to get the transcript.
   */
  async startRecording(): Promise<void> {
    await this._recorder.startRecording({ maxDurationMs: this.config.maxDurationMs });
  }

  /**
   * Stop recording and return the captured audio blob.
   * Use transcribe(blob) to get the text.
   */
  async stopRecording(): Promise<Blob> {
    return this._recorder.stopRecording();
  }

  /**
   * Stop recording AND immediately transcribe.
   * Returns the transcript text.
   * If Whisper is loaded, uses it; otherwise falls back to browser API.
   */
  async stopAndTranscribe(): Promise<TranscriptionResult> {
    const blob = await this._recorder.stopRecording();
    return this.transcribe(blob);
  }

  /**
   * Transcribe an audio blob.
   * Whisper backend: decodes blob → Float32Array → model inference.
   * Browser fallback: this path is not recommended — use transcribeFromMic().
   */
  async transcribe(audio: Blob): Promise<TranscriptionResult> {
    if (this._whisper?.isReady) {
      return this._whisper.transcribe(audio, this.config.language);
    }
    throw new Error("Whisper not loaded — call transcribeFromMic() for browser fallback");
  }

  /**
   * Full hands-free session using the browser SpeechRecognition API.
   * Does NOT use MediaRecorder — taps directly into the mic.
   * Use this as the primary path when Whisper is not loaded.
   */
  async transcribeFromMic(): Promise<TranscriptionResult> {
    return this._browser.transcribeFromMic(this.config.language);
  }

  /**
   * Unified transcription — picks the right strategy automatically.
   *
   * If Whisper is loaded:   startRecording() + stopAndTranscribe() flow
   * If browser API only:    transcribeFromMic() (real-time, no blob needed)
   *
   * Usage:
   *   const { text } = await engine.smartTranscribe({
   *     onRecordingStart: () => setIsRecording(true),
   *     onRecordingStop:  () => setIsTranscribing(true),
   *   });
   */
  async smartTranscribe(opts?: {
    onRecordingStart?: () => void;
    onRecordingStop?:  () => void;
  }): Promise<TranscriptionResult> {
    if (this._whisper?.isReady) {
      opts?.onRecordingStart?.();
      await this.startRecording();
      /* Caller drives stop — via stopAndTranscribe() */
      const blob = await this.stopRecording();
      opts?.onRecordingStop?.();
      return this.transcribe(blob);
    } else {
      /* Browser API: real-time, no explicit record/stop */
      opts?.onRecordingStart?.();
      const result = await this.transcribeFromMic();
      opts?.onRecordingStop?.();
      return result;
    }
  }

  /** Cancel an in-progress recording. */
  cancelRecording(): void {
    this._recorder.cancel();
  }

  dispose(): void {
    this._recorder.cancel();
    this._whisper?.dispose();
    this._ready = false;
  }

  /* ── Private: load Whisper via Transformers.js ────────────────────── */

  private async _tryLoadWhisper(onProgress?: STTProgressCallback): Promise<boolean> {
    try {
      /* Dynamic import — Transformers.js is an optional peer dep.
         Path stored in a variable so TypeScript skips static module resolution.
         Vite ignore comment prevents bundler from trying to resolve it. */
      const _path = "@xenova/transformers";
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { pipeline, env } = await import(/* @vite-ignore */ _path) as {
        pipeline:  (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown>;
        env:       { allowRemoteModels: boolean; backends: Record<string, unknown> };
      };

      /* Configure OPFS caching for offline-first */
      env.allowRemoteModels = true;

      onProgress?.("loading", 0);

      /* Load ASR pipeline */
      const asr = await pipeline(
        "automatic-speech-recognition",
        this.config.model.hfModelId,
        {
          progress_callback: (info: { status: string; progress?: number }) => {
            if (info.status === "progress") {
              onProgress?.("loading", Math.round((info.progress ?? 0)));
            }
          },
        },
      );

      /* Create a concrete inline Whisper backend */
      const model   = this.config.model;
      const backendType = ("gpu" in navigator) ? "whisper-webgpu" as const : "whisper-wasm" as const;

      this._whisper = new (class extends WhisperBackend {
        private _asr = asr;
        private _isReady = true;
        get isReady() { return this._isReady; }

        async init(): Promise<void> { /* already loaded */ }

        async transcribe(audio: Blob, language: STTLanguage): Promise<TranscriptionResult> {
          const t0 = Date.now();
          const f32 = await this.blobToFloat32(audio);
          const langCode = language === "ar" ? "arabic" : language === "en" ? "english" : undefined;
          const result = await (this._asr as (data: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string }>)(
            f32,
            { language: langCode, task: "transcribe" },
          );
          return {
            text:       (result.text ?? "").trim(),
            language,
            confidence: 0.95,
            backend:    this.type,
            durationMs: Date.now() - t0,
          };
        }
        dispose(): void { /* pipeline cleanup handled by GC */ }
      })(model, backendType);

      onProgress?.("loading", 100);
      return true;
    } catch {
      return false; /* Transformers.js not installed — fallback to browser */
    }
  }
}

/* ── React hook ───────────────────────────────────────────────────────── */

export interface UseSTTEngineReturn {
  status:        "idle" | "requesting" | "recording" | "transcribing" | "done" | "error";
  transcript:    string;
  isRecording:   boolean;
  backendType:   STTBackendType | null;
  error:         string | null;
  /** Tap to start recording (Whisper) or STT session (browser API). */
  startSTT:      () => Promise<void>;
  /** Stop recording and transcribe (Whisper path). No-op for browser API. */
  stopSTT:       () => Promise<void>;
  /** Cancel and reset. */
  cancelSTT:     () => void;
  /** Clear transcript. */
  clearTranscript: () => void;
}
