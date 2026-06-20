/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LocalVisionEngine — Vision-Language Model (VLM) Skeleton & Interfaces
 * Part of: HybridRuntime → OfflineMediaEngine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Responsibilities:
 *   1. Accept a captured video frame (ImageData / base64 PNG) + a student question.
 *   2. Run inference via a VLM backend (WebGPU → WebGL2 → WASM CPU).
 *   3. Enrich the answer via RAG — pulling relevant chunks from KnowledgeStore.
 *   4. Return a grounded educational answer that AudioPipeline reads aloud.
 *
 * Supported VLM backends (ONNX-optimised, run fully offline):
 *   • Moondream2   (~1.86 GB Q4)  — lightweight, fast, good general vision
 *   • Phi-3-Vision (~4.2 GB Q4)   — stronger reasoning, needs ≥8 GB RAM
 *   • MiniCPM-V    (~2.4 GB Q4)   — strong multilingual + Arabic text in images
 *
 * Dependency graph:
 *
 *   VideoPlayerWithCapture (React)
 *          │  frameBase64 + question
 *          ▼
 *   LocalVisionEngine   ── RAG ──►  KnowledgeStore
 *          │  enriched answer text
 *          ▼
 *   AudioPipeline.speak()  →  teacher voice profile
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ModelBackendType, ModelManifest, ModelFormat } from "./local-ai-loader";

/* ── Frame capture types ──────────────────────────────────────────────── */

/**
 * VisionFrame
 * -----------
 * A captured still frame from a paused <video> element.
 * The base64 field is a data URL (PNG): "data:image/png;base64,..."
 */
export interface VisionFrame {
  /** PNG data URL — transferable to worker as a string. */
  base64:     string;
  /** Original frame dimensions. */
  width:      number;
  height:     number;
  /** Timestamp in the video at which the frame was captured (seconds). */
  videoTime:  number;
  /** Unix ms of capture — for logging. */
  capturedAt: number;
}

/* ── Vision model manifests ───────────────────────────────────────────── */

export interface VisionModelManifest extends ModelManifest {
  /** Vision-specific: maximum image resolution the model accepts. */
  maxImageSize: number;   // pixels on longest side, e.g. 1344
  /** Whether the model can read text embedded in images (OCR). */
  hasOCR:       boolean;
  /** Whether the model supports Arabic queries/answers natively. */
  hasArabic:    boolean;
}

export const KNOWN_VISION_MODELS = {
  /**
   * Moondream2 — lightweight, fast, good for scene description.
   * ~1.86 GB ONNX Q4 — runs on mid-range devices.
   */
  MOONDREAM2_Q4: {
    id:               "moondream2-q4",
    displayName:      "Moondream2 (Q4 ONNX)",
    sizeBytes:        1_860_000_000,
    format:           "onnx" as ModelFormat,
    remoteUrl:        "https://huggingface.co/vikhyatk/moondream2/resolve/main/onnx/model_q4.onnx",
    preferredBackend: "webgpu" as ModelBackendType,
    quantisation:     "q4",
    contextLen:       2048,
    maxImageSize:     1344,
    hasOCR:           true,
    hasArabic:        false,
  } satisfies VisionModelManifest,

  /**
   * Phi-3-Vision — stronger reasoning, best for math + science diagrams.
   * ~4.2 GB ONNX Q4 — requires ≥8 GB RAM / VRAM.
   */
  PHI3_VISION_Q4: {
    id:               "phi-3-vision-q4",
    displayName:      "Phi-3-Vision 4.2B (Q4 ONNX)",
    sizeBytes:        4_200_000_000,
    format:           "onnx" as ModelFormat,
    remoteUrl:        "https://huggingface.co/microsoft/Phi-3-vision-128k-instruct-onnx-cuda/resolve/main/phi-3-v-128k-instruct-vision.onnx",
    preferredBackend: "webgpu" as ModelBackendType,
    quantisation:     "q4",
    contextLen:       4096,
    maxImageSize:     1344,
    hasOCR:           true,
    hasArabic:        true,
  } satisfies VisionModelManifest,

  /**
   * MiniCPM-V 2.6 — best multilingual + Arabic text in images.
   * ~2.4 GB ONNX Q4.
   */
  MINICPM_V_Q4: {
    id:               "minicpm-v-2.6-q4",
    displayName:      "MiniCPM-V 2.6 (Q4 ONNX)",
    sizeBytes:        2_400_000_000,
    format:           "onnx" as ModelFormat,
    remoteUrl:        "https://huggingface.co/openbmb/MiniCPM-V-2_6-onnx/resolve/main/model_q4.onnx",
    preferredBackend: "webgpu" as ModelBackendType,
    quantisation:     "q4",
    contextLen:       4096,
    maxImageSize:     1792,
    hasOCR:           true,
    hasArabic:        true,
  } satisfies VisionModelManifest,
} as const;

/* ── VLM inference types ──────────────────────────────────────────────── */

export interface VisionQueryOptions {
  /** Max tokens for the answer (default 512). */
  maxNewTokens?: number;
  /** Language to answer in (default "ar"). */
  language?:     "ar" | "en";
  /** Whether to prepend RAG context from KnowledgeStore. */
  useRAG?:       boolean;
  /** Subject hint — narrows RAG retrieval (e.g. "رياضيات"). */
  subject?:      string;
}

export interface VisionQueryResult {
  /** The generated educational answer. */
  answer:          string;
  /** RAG chunks that were used as context. */
  ragSources:      Array<{ text: string; score: number }>;
  /** Which backend ran inference. */
  backend:         ModelBackendType | "simulated";
  /** Tokens generated per second (0 if simulated). */
  tokensPerSecond: number;
  /** Whether the VLM model was loaded (false = RAG-only simulation). */
  modelLoaded:     boolean;
}

/* ── Vision backend abstraction ───────────────────────────────────────── */

/**
 * IVisionBackend
 * --------------
 * Low-level VLM inference engine — one per backend type.
 * LocalVisionEngine selects one automatically based on device capabilities.
 */
export interface IVisionBackend {
  readonly type:    ModelBackendType;
  readonly isReady: boolean;

  /** Load VLM weights (image encoder + text decoder). */
  loadModel(manifest: VisionModelManifest): Promise<void>;

  /**
   * Analyse a frame + question → answer text.
   * imageBase64: PNG data URL.
   * Resolves after full generation (for streaming see generateStream).
   */
  analyze(
    imageBase64: string,
    question:    string,
    opts:        VisionQueryOptions,
  ): Promise<string>;

  /**
   * Streaming variant — calls onToken for each emitted token.
   */
  analyzeStream(
    imageBase64: string,
    question:    string,
    opts:        VisionQueryOptions,
    onToken:     (token: string, isFinished: boolean) => void,
  ): Promise<string>;

  /** Free GPU/WASM memory. */
  unload(): void;
}

/* ── Concrete backend skeletons ───────────────────────────────────────── */

/**
 * WebGPUVisionBackend
 * -------------------
 * Uses WebGPU for image encoding (ViT patch projection) + text decoding.
 * Best performance — Chrome/Edge 113+.
 */
export abstract class WebGPUVisionBackend implements IVisionBackend {
  readonly type = "webgpu" as const;
  abstract readonly isReady: boolean;
  abstract loadModel(manifest: VisionModelManifest): Promise<void>;
  abstract analyze(imageBase64: string, question: string, opts: VisionQueryOptions): Promise<string>;
  abstract analyzeStream(
    imageBase64: string, question: string,
    opts: VisionQueryOptions,
    onToken: (token: string, isFinished: boolean) => void,
  ): Promise<string>;
  abstract unload(): void;
}

/**
 * WasmVisionBackend
 * -----------------
 * WASM CPU fallback — always available but ~5-8× slower than WebGPU.
 * Uses ONNX Runtime Web (ort.js) in CPU execution mode.
 */
export abstract class WasmVisionBackend implements IVisionBackend {
  readonly type = "wasm-cpu" as const;
  abstract readonly isReady: boolean;
  abstract loadModel(manifest: VisionModelManifest): Promise<void>;
  abstract analyze(imageBase64: string, question: string, opts: VisionQueryOptions): Promise<string>;
  abstract analyzeStream(
    imageBase64: string, question: string,
    opts: VisionQueryOptions,
    onToken: (token: string, isFinished: boolean) => void,
  ): Promise<string>;
  abstract unload(): void;
}

/* ── RAG-enriched vision session ──────────────────────────────────────── */

/**
 * IVisionSession
 * --------------
 * Stateful session for a student's video Q&A interaction.
 * Combines VLM inference with KnowledgeStore RAG.
 *
 * Usage:
 *   const session = visionEngine.createSession({ subject: "رياضيات" });
 *   const result  = await session.analyzeFrame(frame, "ما هذا الشكل الهندسي؟");
 *   bridge.speak(result.answer);
 */
export interface IVisionSession {
  readonly sessionId: string;
  readonly subject:   string | undefined;

  /**
   * Analyse a captured video frame + student question.
   * Retrieves RAG context from KnowledgeStore before calling the VLM.
   */
  analyzeFrame(
    frame:    VisionFrame,
    question: string,
    opts?:    VisionQueryOptions,
  ): Promise<VisionQueryResult>;

  /**
   * Streaming variant — calls onToken for each generated token.
   * Returns the full answer after the last token.
   */
  analyzeFrameStream(
    frame:    VisionFrame,
    question: string,
    onToken:  (token: string, isFinished: boolean) => void,
    opts?:    VisionQueryOptions,
  ): Promise<VisionQueryResult>;

  /** Export the Q&A history (for persistence / tutor context). */
  exportHistory(): Array<{
    frameTime:  number;
    question:   string;
    answer:     string;
    timestamp:  number;
  }>;

  dispose(): void;
}

/* ── LocalVisionEngine orchestrator ──────────────────────────────────── */

export interface LocalVisionEngineConfig {
  /** Force a specific backend. Auto-selects if omitted. */
  forceBackend?: ModelBackendType;
  /**
   * KnowledgeStore search function — injected for RAG retrieval.
   * Signature matches ConcreteWorkerBridge.search().
   */
  ragSearch?: (
    query: string,
    topK:  number,
  ) => Promise<Array<{ text: string; score: number }>>;
}

/**
 * ILocalVisionEngine
 * ------------------
 * Main interface — used by ConcreteWorkerBridge and React hooks.
 *
 * Typical flow:
 *   const engine = new LocalVisionEngine(config);
 *   await engine.init();
 *   await engine.loadModel(KNOWN_VISION_MODELS.MOONDREAM2_Q4, onProgress);
 *   const session = engine.createSession({ subject: "فيزياء" });
 *   const result  = await session.analyzeFrame(capturedFrame, "ما هذه المعادلة؟");
 */
export interface ILocalVisionEngine {
  readonly isReady:      boolean;
  readonly activeModel:  VisionModelManifest | null;
  readonly activeBackend: ModelBackendType | null;

  /** Probe device capabilities and select backend. */
  init(): Promise<{ backend: ModelBackendType; hasWebGPU: boolean }>;

  /** Load VLM weights. Reports progress via callback. */
  loadModel(
    manifest:   VisionModelManifest,
    onProgress: (pct: number, phase: string) => void,
  ): Promise<void>;

  /** Unload current model to free VRAM. */
  unloadModel(): void;

  /** Create a new Q&A session. */
  createSession(opts?: { subject?: string; language?: "ar" | "en" }): IVisionSession;

  /** Release all resources. */
  dispose(): void;
}

/* ── Concrete skeleton ────────────────────────────────────────────────── */

export abstract class LocalVisionEngine implements ILocalVisionEngine {
  constructor(protected readonly config: LocalVisionEngineConfig = {}) {}

  abstract readonly isReady:       boolean;
  abstract readonly activeModel:   VisionModelManifest | null;
  abstract readonly activeBackend: ModelBackendType | null;

  abstract init(): Promise<{ backend: ModelBackendType; hasWebGPU: boolean }>;
  abstract loadModel(manifest: VisionModelManifest, onProgress: (pct: number, phase: string) => void): Promise<void>;
  abstract unloadModel(): void;
  abstract createSession(opts?: { subject?: string; language?: "ar" | "en" }): IVisionSession;
  abstract dispose(): void;

  /** Utility: convert base64 PNG data URL → ImageData (main thread only). */
  static async base64ToImageData(base64: string): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("No 2D context")); return; }
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = base64;
    });
  }

  /** Utility: resize base64 image to maxSize on longest side before sending to VLM. */
  static async resizeFrame(base64: string, maxSize: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale  = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.naturalWidth  * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("No 2D context")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Image resize failed"));
      img.src = base64;
    });
  }

  /** Auto-select best backend. */
  protected async detectBackend(): Promise<ModelBackendType> {
    if (this.config.forceBackend) return this.config.forceBackend;
    if ("gpu" in navigator) {
      try {
        const adapter = await (navigator as unknown as {
          gpu: { requestAdapter(): Promise<unknown> }
        }).gpu.requestAdapter();
        if (adapter) return "webgpu";
      } catch { /* fall through */ }
    }
    const canvas = document.createElement("canvas");
    if (canvas.getContext("webgl2")) return "webgl2";
    return "wasm-cpu";
  }
}

/* ── Frame capture utility ────────────────────────────────────────────── */

/**
 * captureVideoFrame
 * -----------------
 * Call this from a <video> element's `onPause` event handler.
 * Draws the current frame onto an offscreen canvas and returns a VisionFrame.
 *
 * Usage (React):
 *   videoRef.current.onpause = async () => {
 *     const frame = await captureVideoFrame(videoRef.current!);
 *     setCurrentFrame(frame);
 *   };
 */
export function captureVideoFrame(video: HTMLVideoElement): VisionFrame {
  const canvas  = document.createElement("canvas");
  canvas.width   = video.videoWidth  || 640;
  canvas.height  = video.videoHeight || 360;
  const ctx      = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get 2D context for frame capture");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    base64:     canvas.toDataURL("image/png"),
    width:      canvas.width,
    height:     canvas.height,
    videoTime:  video.currentTime,
    capturedAt: Date.now(),
  };
}
