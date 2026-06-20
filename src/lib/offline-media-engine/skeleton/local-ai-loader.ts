/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LocalAILoader — Skeleton & Interfaces
 * Part of: HybridRuntime → OfflineMediaEngine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Design goals:
 *  1. Load SLM (Small Language Models) into the browser and run inference
 *     entirely offline, delegating GPU work to the existing GpuBridge.
 *  2. Support multiple backends (WebGPU native, WebGL2 via GpuBridge, WASM CPU)
 *     selected automatically based on device capabilities.
 *  3. Expose a unified `ISLMSession` per loaded model — the Tutor module
 *     programs against this interface, never the raw loader.
 *  4. Integrate with KnowledgeStore's retrieval for RAG (Retrieval-Augmented
 *     Generation) so answers are grounded in local curriculum content.
 *
 * Dependency graph:
 *
 *   GpuBridge (existing HybridRuntime)
 *        │
 *        ▼
 *   IModelBackend ←implements─  WebGPUBackend   (native WebGPU, best perf)
 *                 ←implements─  WebGLBackend    (via GpuBridge, wider support)
 *                 ←implements─  WasmCPUBackend  (fallback, always available)
 *        │
 *        ▼
 *   LocalAILoader  (manages lifecycle: download → cache → load → session)
 *        │
 *        ▼
 *   ISLMSession    (per-model inference handle, used by AITutor + RAG)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { GpuBridge } from "../../hybrid-runtime/gpu";

/* ── Model registry types ─────────────────────────────────────────────── */

export type ModelBackendType = "webgpu" | "webgl2" | "wasm-cpu";

export type ModelFormat = "onnx" | "gguf" | "safetensors";

export interface ModelManifest {
  /** Stable ID used for cache keys. */
  id:          string;
  displayName: string;
  /** Total model size in bytes (shown in download UI). */
  sizeBytes:   number;
  format:      ModelFormat;
  /** Remote URL — only used once; bytes are cached in OPFS / Cache API. */
  remoteUrl:   string;
  /**
   * Minimum recommended backend.
   * Loader will auto-downgrade if device doesn't support the preferred one.
   */
  preferredBackend: ModelBackendType;
  /** Quantisation: "q4" | "q8" | "fp16" | "fp32" */
  quantisation: string;
  /** Context length in tokens. */
  contextLen:  number;
  /** Hugging Face-style tokenizer config URL (optional; can be bundled). */
  tokenizerUrl?: string;
}

export interface ModelCacheEntry {
  manifestId:  string;
  cachedAt:    number;
  sizeBytes:   number;
  /** OPFS file handle path or Cache API key. */
  storageKey:  string;
  backend:     ModelBackendType;
}

/* ── Load progress ────────────────────────────────────────────────────── */

export interface LoadProgress {
  phase:       "download" | "verify" | "parse" | "compile" | "warmup" | "ready";
  /** 0–100 */
  pct:         number;
  bytesLoaded: number;
  bytesTotal:  number;
  message:     string;
}

export type LoadProgressCallback = (p: LoadProgress) => void;

/* ── Inference types ─────────────────────────────────────────────────── */

export interface GenerationOptions {
  maxNewTokens?:   number;    // default 256
  temperature?:    number;    // default 0.7
  topP?:           number;    // default 0.9
  topK?:           number;    // default 40
  repetitionPenalty?: number; // default 1.1
  stopSequences?:  string[];
}

export interface GenerationResult {
  text:           string;
  tokenCount:     number;
  tokensPerSecond: number;
  /** Which backend actually ran inference. */
  backend:        ModelBackendType;
  finishReason:   "stop" | "max_tokens" | "error";
}

/** Streamed token event — emitted by ISLMSession.generateStream() */
export interface TokenEvent {
  token:         string;
  tokenId:       number;
  isFinished:    boolean;
  finishReason?: "stop" | "max_tokens" | "error";
}

/* ── RAG context ─────────────────────────────────────────────────────── */

export interface RAGContext {
  /** Retrieved document chunks from KnowledgeStore, ranked by relevance. */
  chunks: Array<{
    text:    string;
    score:   number;
    source:  string;
  }>;
  /** Prompt template that wraps context + user question. */
  promptTemplate: string;
}

/* ── Model backend abstraction ───────────────────────────────────────── */

/**
 * IModelBackend
 * -------------
 * Low-level inference engine. LocalAILoader selects one at init time.
 */
export interface IModelBackend {
  readonly type:    ModelBackendType;
  readonly isReady: boolean;

  /** Load model weights into GPU/WASM memory. */
  load(weights: ArrayBuffer, manifest: ModelManifest): Promise<void>;

  /**
   * Run a single forward pass (full generation).
   * Prefer generateStream() for large outputs.
   */
  generate(prompt: string, opts: GenerationOptions): Promise<GenerationResult>;

  /**
   * Streaming generation — calls `onToken` for each emitted token.
   * Returns after the final token.
   */
  generateStream(
    prompt:   string,
    opts:     GenerationOptions,
    onToken:  (e: TokenEvent) => void,
  ): Promise<GenerationResult>;

  /** Tokenise text (needed by caller to measure context length). */
  tokenise(text: string): Promise<number[]>;

  /** Free GPU/WASM buffers. */
  unload(): void;
}

/* Concrete backend skeletons */

/** WebGPU native backend (best performance, Chrome/Edge 113+) */
export abstract class WebGPUBackend implements IModelBackend {
  readonly type = "webgpu" as const;
  abstract readonly isReady: boolean;

  abstract load(weights: ArrayBuffer, manifest: ModelManifest): Promise<void>;
  abstract generate(prompt: string, opts: GenerationOptions): Promise<GenerationResult>;
  abstract generateStream(
    prompt: string, opts: GenerationOptions, onToken: (e: TokenEvent) => void
  ): Promise<GenerationResult>;
  abstract tokenise(text: string): Promise<number[]>;
  abstract unload(): void;
}

/** WebGL2 backend — delegates matrix ops to GpuBridge (wider device support) */
export abstract class WebGLBackend implements IModelBackend {
  readonly type = "webgl2" as const;

  /**
   * @param gpuBridge  Existing HybridRuntime GpuBridge for GPGPU compute.
   */
  constructor(protected readonly gpuBridge: GpuBridge) {}

  abstract readonly isReady: boolean;
  abstract load(weights: ArrayBuffer, manifest: ModelManifest): Promise<void>;
  abstract generate(prompt: string, opts: GenerationOptions): Promise<GenerationResult>;
  abstract generateStream(
    prompt: string, opts: GenerationOptions, onToken: (e: TokenEvent) => void
  ): Promise<GenerationResult>;
  abstract tokenise(text: string): Promise<number[]>;
  abstract unload(): void;
}

/** WASM CPU fallback — always available, ~3–10× slower than GPU */
export abstract class WasmCPUBackend implements IModelBackend {
  readonly type = "wasm-cpu" as const;
  abstract readonly isReady: boolean;
  abstract load(weights: ArrayBuffer, manifest: ModelManifest): Promise<void>;
  abstract generate(prompt: string, opts: GenerationOptions): Promise<GenerationResult>;
  abstract generateStream(
    prompt: string, opts: GenerationOptions, onToken: (e: TokenEvent) => void
  ): Promise<GenerationResult>;
  abstract tokenise(text: string): Promise<number[]>;
  abstract unload(): void;
}

/* ── SLM Session ─────────────────────────────────────────────────────── */

/**
 * ISLMSession
 * -----------
 * Stateful conversation handle returned by LocalAILoader.createSession().
 * AITutor uses this — it never touches IModelBackend directly.
 *
 * Conversation memory is stored in-session as a sliding window;
 * older turns are evicted when context length is exceeded.
 */
export interface ISLMSession {
  readonly sessionId:  string;
  readonly modelId:    string;
  readonly backend:    ModelBackendType;

  /**
   * Generate a response to `userMessage`.
   * If `ragContext` is provided, it is prepended as grounding context.
   */
  chat(
    userMessage: string,
    ragContext?:  RAGContext,
    opts?:        GenerationOptions,
  ): Promise<string>;

  /**
   * Streaming variant — calls `onToken` for each new token.
   */
  chatStream(
    userMessage: string,
    onToken:     (e: TokenEvent) => void,
    ragContext?:  RAGContext,
    opts?:        GenerationOptions,
  ): Promise<string>;

  /** Clear conversation history (keeps system prompt). */
  clearHistory(): void;

  /** Return entire conversation as a plain array (for persistence). */
  exportHistory(): Array<{ role: "system" | "user" | "assistant"; content: string }>;

  dispose(): void;
}

/* ── LocalAILoader ───────────────────────────────────────────────────── */

export interface LocalAILoaderConfig {
  /** GpuBridge from HybridRuntime — used by WebGLBackend. */
  gpuBridge:  GpuBridge;
  /**
   * Force a specific backend. If omitted, auto-selects:
   *   webgpu → webgl2 → wasm-cpu
   */
  forceBackend?: ModelBackendType;
  /** System prompt injected at the start of every session. */
  systemPrompt?: string;
}

/**
 * ILocalAILoader
 * --------------
 * Manages model download, caching (OPFS / Cache API), loading, and session
 * creation. Only one model is loaded at a time (swap if needed).
 *
 * Typical flow:
 *   const loader = new LocalAILoader(config);
 *   await loader.init();
 *   await loader.loadModel(PHI2_MANIFEST, onProgress);
 *   const session = loader.createSession();
 *   const reply   = await session.chat("ما هي مشتقة sin(x)؟");
 */
export interface ILocalAILoader {
  readonly activeModel:  ModelManifest | null;
  readonly activeBackend: ModelBackendType | null;
  readonly isReady:      boolean;

  /** Probe GPU capabilities and select the best available backend. */
  init(): Promise<{ backend: ModelBackendType; gpuDevice: string | null }>;

  /**
   * Download (if not cached) and load a model.
   * Uses OPFS for persistent storage — subsequent loads are instant.
   */
  loadModel(
    manifest:   ModelManifest,
    onProgress: LoadProgressCallback,
  ): Promise<void>;

  /**
   * Swap to a different model.
   * Unloads current model first to free GPU memory.
   */
  swapModel(
    manifest:   ModelManifest,
    onProgress: LoadProgressCallback,
  ): Promise<void>;

  /** List all locally cached models. */
  listCachedModels(): Promise<ModelCacheEntry[]>;

  /** Delete a cached model from OPFS / Cache API. */
  evictModel(manifestId: string): Promise<void>;

  /**
   * Create a new conversation session against the loaded model.
   * Multiple sessions can coexist (each has its own history buffer).
   */
  createSession(systemPrompt?: string): ISLMSession;

  /** Release all GPU/WASM resources. */
  dispose(): void;
}

/* Concrete skeleton */
export abstract class LocalAILoader implements ILocalAILoader {
  constructor(protected readonly config: LocalAILoaderConfig) {}

  abstract readonly activeModel:   ModelManifest | null;
  abstract readonly activeBackend: ModelBackendType | null;
  abstract readonly isReady:       boolean;

  abstract init(): Promise<{ backend: ModelBackendType; gpuDevice: string | null }>;
  abstract loadModel(manifest: ModelManifest, onProgress: LoadProgressCallback): Promise<void>;
  abstract swapModel(manifest: ModelManifest, onProgress: LoadProgressCallback): Promise<void>;
  abstract listCachedModels(): Promise<ModelCacheEntry[]>;
  abstract evictModel(manifestId: string): Promise<void>;
  abstract createSession(systemPrompt?: string): ISLMSession;
  abstract dispose(): void;

  /**
   * Auto-select backend by probing available APIs.
   * Concrete class calls this inside init().
   */
  protected async detectBestBackend(): Promise<ModelBackendType> {
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

/* ── Pre-defined model manifests ─────────────────────────────────────── */

/**
 * Ready-to-use manifests for common open-weight SLMs.
 * Swap `remoteUrl` to a self-hosted or CDN URL before production use.
 */
export const KNOWN_MODELS = {
  /** Microsoft Phi-2 (2.7 B params, ONNX Q4, ~1.5 GB) */
  PHI2_Q4: {
    id:              "phi-2-q4",
    displayName:     "Phi-2 (Q4 ONNX)",
    sizeBytes:       1_500_000_000,
    format:          "onnx" as ModelFormat,
    remoteUrl:       "https://huggingface.co/microsoft/phi-2/resolve/main/onnx/phi-2-q4.onnx",
    preferredBackend:"webgpu" as ModelBackendType,
    quantisation:    "q4",
    contextLen:      2048,
  } satisfies ModelManifest,

  /** TinyLlama (1.1 B params, GGUF Q4, ~600 MB — best for low-RAM devices) */
  TINYLLAMA_Q4: {
    id:              "tinyllama-1.1b-q4",
    displayName:     "TinyLlama 1.1B (Q4)",
    sizeBytes:       638_000_000,
    format:          "gguf" as ModelFormat,
    remoteUrl:       "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
    preferredBackend:"webgpu" as ModelBackendType,
    quantisation:    "q4",
    contextLen:      2048,
  } satisfies ModelManifest,

  /** AraGPT2-medium — Arabic-first model (smaller, Arabic optimised) */
  ARAGPT2: {
    id:              "aragpt2-medium",
    displayName:     "AraGPT2 Medium (Arabic)",
    sizeBytes:       340_000_000,
    format:          "onnx" as ModelFormat,
    remoteUrl:       "https://huggingface.co/aubmindlab/aragpt2-medium/resolve/main/onnx/model.onnx",
    preferredBackend:"webgl2" as ModelBackendType,
    quantisation:    "fp16",
    contextLen:      1024,
  } satisfies ModelManifest,
} as const;
