/**
 * ─────────────────────────────────────────────────────────────────────────────
 * OfflineMediaEngine — Skeleton Barrel Export
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* AudioPipeline */
export type {
  TTSVoiceDescriptor,
  SynthesisOptions,
  AudioPipelineEvent,
  IONNXTTSAdapter,
  ITextPreprocessor,
  IAudioBackend,
  AudioPipelineConfig,
} from "./audio-pipeline";
export {
  BrowserSpeechBackend,
  ONNXWasmBackend,
  AudioPipeline,
} from "./audio-pipeline";

/* KnowledgeStore */
export type {
  DocumentChunk,
  ChunkMetadata,
  BookDescriptor,
  SearchResult,
  IndexStats,
  IEmbeddingModel,
  IVectorIndex,
  IDBAdapter,
  KnowledgeStoreConfig,
  IKnowledgeStore,
} from "./knowledge-store";
export {
  TFIDFEmbedding,
  WebGPUEmbedding,
  CosineIndex,
  KnowledgeStore,
} from "./knowledge-store";

/* LocalAILoader */
export type {
  ModelBackendType,
  ModelFormat,
  ModelManifest,
  ModelCacheEntry,
  LoadProgress,
  LoadProgressCallback,
  GenerationOptions,
  GenerationResult,
  TokenEvent,
  RAGContext,
  IModelBackend,
  ISLMSession,
  LocalAILoaderConfig,
  ILocalAILoader,
} from "./local-ai-loader";
export {
  WebGPUBackend,
  WebGLBackend,
  WasmCPUBackend,
  LocalAILoader,
  KNOWN_MODELS,
} from "./local-ai-loader";

/* WorkerBridge */
export type {
  WorkerRequestType,
  WorkerRequest,
  WorkerResponse,
  WorkerBridgeConfig,
  IWorkerBridge,
  IWorkerDispatcher,
  ResponseHandler,
} from "./worker-bridge";
export {
  OfflineMediaWorkerDispatcher,
  WorkerBridge,
} from "./worker-bridge";

/* React hook */
export type {
  OMEStatus,
  OMEActions,
  UseOfflineMediaEngineReturn,
} from "./use-offline-media-engine";
export { useOfflineMediaEngine } from "./use-offline-media-engine";
