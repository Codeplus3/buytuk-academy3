/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AudioPipeline — Skeleton & Interfaces
 * Part of: HybridRuntime → OfflineMediaEngine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Design goals:
 *  1. Decouple the synthesis backend (browser SpeechSynthesis ↔ ONNX WASM)
 *     behind a single `IAudioBackend` interface so swapping is a one-liner.
 *  2. Stream audio chunk-by-chunk so large texts never block the main thread.
 *  3. Expose an `IONNXTTSAdapter` that future ONNX model files can implement
 *     without touching the rest of the pipeline.
 *
 * Dependency graph:
 *
 *   IAudioBackend  ←implements─  BrowserSpeechBackend   (current)
 *                  ←implements─  ONNXWasmBackend         (future – slot ready)
 *        │
 *        ▼
 *   AudioPipeline  (orchestrator: normalise → segment → synthesise → emit)
 *        │
 *        ▼
 *   AudioPipelineEvent  (streamed to UI via EventEmitter / React callback)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ── Shared value objects ─────────────────────────────────────────────── */

export interface TTSVoiceDescriptor {
  id:           string;
  displayName:  string;
  languageCode: string;   // e.g. "ar-SA"
  gender:       "male" | "female" | "neutral";
  isLocal:      boolean;  // true → works fully offline
  backend:      "browser" | "onnx";
}

export interface SynthesisOptions {
  voice?:      TTSVoiceDescriptor;
  rate?:       number;   // 0.5 – 2.0
  pitch?:      number;   // 0.0 – 2.0
  volume?:     number;   // 0.0 – 1.0
  language?:   string;   // ISO tag, default "ar-SA"
}

/** Emitted for each synthesised segment (word boundary or chunk) */
export interface AudioPipelineEvent {
  type:       "word" | "sentence" | "done" | "error";
  text:       string;
  charIndex:  number;
  charLength: number;
  audioData?: ArrayBuffer;   // non-null only when ONNX backend is active
  error?:     Error;
}

/* ── ONNX adapter slot ────────────────────────────────────────────────── */

/**
 * IONNXTTSAdapter
 * ----------------
 * Implement this interface against any ONNX TTS model file
 * (e.g. Kokoro, VITS, FastSpeech2) to plug it into the pipeline.
 *
 * Loading flow:
 *   loadModel(url | ArrayBuffer)
 *     └─ warmUp()          ← run a silent inference to JIT-compile the graph
 *         └─ synthesise()  ← called per segment by AudioPipeline
 */
export interface IONNXTTSAdapter {
  /** Load model weights. `source` can be a URL or pre-fetched ArrayBuffer. */
  loadModel(source: string | ArrayBuffer): Promise<void>;

  /** Run a silent warm-up pass so first real synthesis is instant. */
  warmUp(): Promise<void>;

  /**
   * Synthesise a single short segment (≤ 200 chars recommended).
   * Returns raw PCM f32 samples at the model's native sample rate.
   */
  synthesise(
    text:    string,
    options: SynthesisOptions,
  ): Promise<{ samples: Float32Array; sampleRate: number }>;

  /** Release GPU/WASM memory. */
  dispose(): void;

  readonly isReady:     boolean;
  readonly modelId:     string;
  readonly sampleRate:  number;
}

/* ── Text preprocessor ───────────────────────────────────────────────── */

export interface ITextPreprocessor {
  /**
   * Normalise Arabic text before synthesis:
   *   • Convert Eastern-Arabic numerals  ٠١٢ → 012
   *   • Expand abbreviations             ص.  → صفحة
   *   • Strip unsupported Unicode ranges
   */
  normalise(text: string): string;

  /**
   * Split long text into synthesisable segments.
   * Strategy: sentence boundaries first, then 200-char hard cap.
   */
  segment(text: string): string[];
}

/* ── Synthesis backend abstraction ───────────────────────────────────── */

/**
 * IAudioBackend
 * -------------
 * Both BrowserSpeechBackend and ONNXWasmBackend implement this.
 * AudioPipeline programs against this interface only, never a concrete class.
 */
export interface IAudioBackend {
  readonly backendId: "browser-speech" | "onnx-wasm";
  readonly isReady:   boolean;

  /** Initialise the backend (load model, warm up voices, etc.). */
  init(): Promise<void>;

  /** List available voices from this backend. */
  getVoices(): TTSVoiceDescriptor[];

  /**
   * Synthesise one segment and stream events via `onEvent`.
   * Must resolve after the segment finishes playing / after audio bytes
   * are returned (ONNX path).
   */
  synthesiseSegment(
    segment:  string,
    options:  SynthesisOptions,
    onEvent:  (e: AudioPipelineEvent) => void,
  ): Promise<void>;

  /** Pause, resume, stop controls (no-op for ONNX — caller handles playback). */
  pause():  void;
  resume(): void;
  stop():   void;

  dispose(): void;
}

/* ── Concrete backend skeletons ──────────────────────────────────────── */

/**
 * BrowserSpeechBackend
 * ---------------------
 * Uses window.speechSynthesis. Works offline once OS voices are cached.
 * Current production backend.
 */
export abstract class BrowserSpeechBackend implements IAudioBackend {
  readonly backendId = "browser-speech" as const;
  abstract readonly isReady: boolean;

  abstract init():       Promise<void>;
  abstract getVoices():  TTSVoiceDescriptor[];
  abstract synthesiseSegment(
    segment: string, options: SynthesisOptions, onEvent: (e: AudioPipelineEvent) => void
  ): Promise<void>;
  abstract pause():   void;
  abstract resume():  void;
  abstract stop():    void;
  abstract dispose(): void;
}

/**
 * ONNXWasmBackend
 * ---------------
 * Uses an IONNXTTSAdapter + Web Audio API for playback.
 * Slot is ready — drop in any IONNXTTSAdapter implementation.
 *
 * Loading sequence:
 *   new ONNXWasmBackend(adapter)
 *     .init()           ← calls adapter.loadModel() + adapter.warmUp()
 *     .synthesiseSegment(...)   ← calls adapter.synthesise() then plays PCM
 */
export abstract class ONNXWasmBackend implements IAudioBackend {
  readonly backendId = "onnx-wasm" as const;

  /**
   * @param adapter  Any IONNXTTSAdapter-compliant object
   *                 (Kokoro, VITS, FastSpeech2, …)
   */
  constructor(protected readonly adapter: IONNXTTSAdapter) {}

  abstract readonly isReady: boolean;

  abstract init():       Promise<void>;
  abstract getVoices():  TTSVoiceDescriptor[];
  abstract synthesiseSegment(
    segment: string, options: SynthesisOptions, onEvent: (e: AudioPipelineEvent) => void
  ): Promise<void>;
  abstract pause():   void;
  abstract resume():  void;
  abstract stop():    void;
  abstract dispose(): void;

  /**
   * PCM → AudioBuffer → AudioContext playback helper.
   * Concrete subclass calls this after adapter.synthesise().
   */
  protected async playPCM(
    _samples:    Float32Array,
    _sampleRate: number,
    _onEnd:      () => void,
  ): Promise<void> {
    // TODO: implement via window.AudioContext
    throw new Error("Not implemented — override in concrete class");
  }
}

/* ── AudioPipeline orchestrator ──────────────────────────────────────── */

export interface AudioPipelineConfig {
  /** Backend to use. Defaults to BrowserSpeechBackend. */
  backend?:      IAudioBackend;

  /** Text preprocessor. Defaults to built-in Arabic normaliser. */
  preprocessor?: ITextPreprocessor;

  /** Max segment length before hard split (chars). Default 200. */
  maxSegmentLen?: number;

  /** Pause between segments (ms). Default 200. */
  segmentGap?:   number;
}

/**
 * AudioPipeline
 * -------------
 * Orchestrates: normalise → segment → backend.synthesiseSegment (serial loop)
 *
 * Usage:
 *   const pipeline = new AudioPipeline({ backend: new BrowserSpeechBackend() });
 *   await pipeline.init();
 *   await pipeline.speak("النص المراد قراءته", { rate: 0.9 }, evt => console.log(evt));
 *
 *   // Later — swap to ONNX with zero changes to caller:
 *   const pipeline = new AudioPipeline({ backend: new ONNXWasmBackend(kokoroAdapter) });
 */
export abstract class AudioPipeline {
  constructor(protected readonly config: AudioPipelineConfig) {}

  /** Initialise backend + preprocessor. Must be awaited before speak(). */
  abstract init(): Promise<void>;

  /** Return all voices from the active backend. */
  abstract getVoices(): TTSVoiceDescriptor[];

  /**
   * Main entry point.
   * Segments `text`, feeds each segment to the backend, streams events.
   * Returns after all segments finish.
   */
  abstract speak(
    text:     string,
    options?: SynthesisOptions,
    onEvent?: (e: AudioPipelineEvent) => void,
  ): Promise<void>;

  abstract pause():   void;
  abstract resume():  void;
  abstract stop():    void;

  /**
   * Hot-swap the backend at runtime (e.g. user downloads ONNX model mid-session).
   * Must stop current synthesis first.
   */
  abstract swapBackend(next: IAudioBackend): Promise<void>;

  abstract dispose(): void;
}
