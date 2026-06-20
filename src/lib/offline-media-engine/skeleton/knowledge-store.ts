/**
 * ─────────────────────────────────────────────────────────────────────────────
 * KnowledgeStore — Skeleton & Interfaces
 * Part of: HybridRuntime → OfflineMediaEngine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Design goals:
 *  1. Store & retrieve educational content (book chunks) from IndexedDB.
 *  2. Maintain an in-memory vector index (TF-IDF + Cosine initially,
 *     dense embeddings later) for semantic search without a server.
 *  3. Layer a transparent encryption adapter so all persisted blobs are
 *     AES-GCM encrypted before hitting IndexedDB.
 *  4. Decouple the embedding strategy behind IEmbeddingModel so we can
 *     upgrade from TF-IDF → WebGPU dense embeddings in one swap.
 *
 * Dependency graph:
 *
 *   IEmbeddingModel ←implements─  TFIDFEmbedding    (current, CPU, zero deps)
 *                   ←implements─  WebGPUEmbedding   (future, ~50 MB model)
 *        │
 *        ▼
 *   IVectorIndex    ←implements─  CosineIndex       (flat, good to ~50 k docs)
 *                   ←implements─  HNSWIndex         (future, millions of docs)
 *        │
 *        ▼
 *   IKnowledgeStore ←implements─  KnowledgeStore    (orchestrator)
 *        │
 *        ▼
 *   IDBAdapter  (encrypted IndexedDB persistence layer)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ── Domain value objects ─────────────────────────────────────────────── */

export interface DocumentChunk {
  /** Globally unique: `${bookId}_ch${chapterIdx}_c${chunkIdx}` */
  id:           string;
  bookId:       string;
  chapterIndex: number;
  chunkIndex:   number;
  text:         string;
  metadata:     ChunkMetadata;
}

export interface ChunkMetadata {
  subject:    string;
  pageRange?: [number, number];
  tags?:      string[];
  language:   string;   // "ar" | "en"
  wordCount:  number;
  createdAt:  number;   // Unix ms
}

export interface BookDescriptor {
  id:        string;
  title:     string;
  subject:   string;
  author:    string;
  chapters:  string[];
  chunkIds:  string[];
  createdAt: number;
  encrypted: boolean;
  /** Primary language of the book's content — used to route TTS and filter search. */
  language?: "ar" | "en";
  title_ar?: string;
  title_en?: string;
}

export interface SearchResult {
  chunkId:      string;
  bookId:       string;
  chapterIndex: number;
  text:         string;
  score:        number;   // 0.0 – 1.0
  highlight:    string;   // snippet with matched terms
}

export interface IndexStats {
  totalChunks:   number;
  totalBooks:    number;
  vocabSize:     number;
  embeddingDim:  number;
  indexType:     "tfidf-cosine" | "dense-cosine" | "hnsw";
  lastUpdated:   number;
}

/* ── Embedding model abstraction ─────────────────────────────────────── */

/**
 * IEmbeddingModel
 * ---------------
 * Converts raw text → a fixed-dimensional float vector.
 *
 * Current impl  → TFIDFEmbedding  (sparse, CPU, instant init)
 * Future drop-in → WebGPUEmbedding (dense, ~50 MB ONNX, needs LocalAILoader)
 */
export interface IEmbeddingModel {
  readonly modelId:      string;
  readonly embeddingDim: number;
  readonly isReady:      boolean;

  /**
   * Fit the model on a corpus (only needed for TF-IDF; no-op for dense models
   * that ship pre-trained weights).
   */
  fit(corpus: DocumentChunk[]): Promise<void>;

  /** Embed a single piece of text. */
  embed(text: string): Promise<Float32Array>;

  /** Batch embed — implementations should parallelise when possible. */
  embedBatch(texts: string[]): Promise<Float32Array[]>;

  dispose(): void;
}

/* Concrete skeleton — TF-IDF (current) */
export abstract class TFIDFEmbedding implements IEmbeddingModel {
  readonly modelId     = "tfidf-sparse" as const;
  abstract readonly embeddingDim: number;
  abstract readonly isReady:      boolean;

  abstract fit(corpus: DocumentChunk[]): Promise<void>;
  abstract embed(text: string): Promise<Float32Array>;
  abstract embedBatch(texts: string[]): Promise<Float32Array[]>;
  dispose(): void { /* no resources to free */ }
}

/** Dense embedding skeleton — plug WebGPU model here */
export abstract class WebGPUEmbedding implements IEmbeddingModel {
  readonly modelId = "webgpu-dense" as const;

  /**
   * @param gpuBridge  Existing HybridRuntime GpuBridge instance.
   * @param modelUrl   URL or ArrayBuffer of the ONNX embedding model.
   */
  constructor(
    protected readonly modelUrl: string | ArrayBuffer,
  ) {}

  abstract readonly embeddingDim: number;
  abstract readonly isReady:      boolean;

  abstract fit(corpus: DocumentChunk[]): Promise<void>;
  abstract embed(text: string): Promise<Float32Array>;
  abstract embedBatch(texts: string[]): Promise<Float32Array[]>;
  abstract dispose(): void;
}

/* ── Vector index abstraction ─────────────────────────────────────────── */

/**
 * IVectorIndex
 * ------------
 * In-memory index of embedding vectors. Rebuilt from IndexedDB on startup.
 *
 * Current impl  → CosineIndex  (flat scan, O(n))
 * Future drop-in → HNSWIndex   (approximate, O(log n))
 */
export interface IVectorIndex {
  readonly size:      number;
  readonly indexType: "cosine-flat" | "hnsw";

  /** Insert or overwrite a vector for a chunk. */
  upsert(chunkId: string, vector: Float32Array): void;

  /** Remove a chunk's vector (called on book delete). */
  remove(chunkId: string): void;

  /**
   * Return top-K chunk IDs ranked by similarity to `queryVector`.
   */
  query(queryVector: Float32Array, topK: number): Array<{ chunkId: string; score: number }>;

  /** Serialise to transferable form for persistence (optional). */
  serialise(): ArrayBuffer;

  /** Restore from serialised form. */
  deserialise(buf: ArrayBuffer): void;

  clear(): void;
}

/* Concrete skeleton — flat cosine (current) */
export abstract class CosineIndex implements IVectorIndex {
  readonly indexType = "cosine-flat" as const;
  abstract readonly size: number;

  abstract upsert(chunkId: string, vector: Float32Array): void;
  abstract remove(chunkId: string): void;
  abstract query(queryVector: Float32Array, topK: number): Array<{ chunkId: string; score: number }>;
  abstract serialise(): ArrayBuffer;
  abstract deserialise(buf: ArrayBuffer): void;
  abstract clear(): void;
}

/* ── Encrypted IndexedDB adapter ─────────────────────────────────────── */

/**
 * IDBAdapter
 * ----------
 * All reads/writes go through here. The adapter holds a CryptoKey
 * and transparently encrypts/decrypts JSON payloads via AES-GCM-256.
 */
export interface IDBAdapter {
  readonly dbName: string;
  readonly ready:  boolean;

  open(): Promise<void>;

  /* Chunks */
  putChunk(chunk: DocumentChunk): Promise<void>;
  getChunk(id: string): Promise<DocumentChunk | null>;
  getAllChunks(bookId?: string): Promise<DocumentChunk[]>;
  deleteChunk(id: string): Promise<void>;

  /* Books */
  putBook(book: BookDescriptor): Promise<void>;
  getBook(id: string): Promise<BookDescriptor | null>;
  getAllBooks(): Promise<BookDescriptor[]>;
  deleteBook(id: string): Promise<void>;

  /** Rotate encryption key — re-encrypts all persisted blobs. */
  rotateKey(newKey: CryptoKey): Promise<void>;

  close(): void;
}

/* ── KnowledgeStore orchestrator ─────────────────────────────────────── */

export interface KnowledgeStoreConfig {
  db:              IDBAdapter;
  embeddingModel:  IEmbeddingModel;
  vectorIndex:     IVectorIndex;
  /** If true, rebuild the vector index from IndexedDB on init(). Default true. */
  rebuildOnInit?:  boolean;
  /** Max chars per chunk when ingesting raw text. Default 400. */
  chunkSize?:      number;
  /** Overlap between adjacent chunks (chars). Default 80. */
  chunkOverlap?:   number;
}

/**
 * IKnowledgeStore
 * ---------------
 * Public contract consumed by OfflineMediaEngine and the AI Tutor RAG layer.
 *
 * Lifecycle:
 *   new KnowledgeStore(config)
 *     .init()           ← opens IDB, loads embedding model, rebuilds index
 *     .ingestBook(...)  ← chunk → embed → upsert index + persist to IDB
 *     .search(query)    ← embed query → index.query → hydrate chunks
 *     .getChunks(bookId)← raw retrieval without re-ranking
 */
export interface IKnowledgeStore {
  readonly stats: IndexStats;

  /** Open IDB, fit embedding model, rebuild vector index. */
  init(): Promise<void>;

  /**
   * Ingest a full book: chunk raw text, embed, persist to IDB, upsert index.
   * Safe to call repeatedly — uses upsert semantics.
   */
  ingestBook(
    descriptor: Omit<BookDescriptor, "chunkIds" | "createdAt">,
    rawChapters: Array<{ title: string; text: string }>,
  ): Promise<BookDescriptor>;

  /**
   * Semantic search across all ingested content.
   * @param query    — Natural-language query (Arabic or English).
   * @param topK     — Max results. Default 5.
   * @param language — If provided, restricts results to chunks of that language.
   *                   Pass "ar" or "en"; omit for cross-lingual search.
   */
  search(query: string, topK?: number, language?: "ar" | "en"): Promise<SearchResult[]>;

  /** Retrieve all chunks for a book (ordered). */
  getChunks(bookId: string): Promise<DocumentChunk[]>;

  /** Delete book and all its chunks from IDB + vector index. */
  deleteBook(bookId: string): Promise<void>;

  /**
   * Hot-swap the embedding model (e.g. upgrade from TF-IDF → dense).
   * Re-embeds all existing chunks in the background.
   */
  upgradeEmbeddingModel(next: IEmbeddingModel): Promise<void>;

  dispose(): void;
}

/* Concrete skeleton */
export abstract class KnowledgeStore implements IKnowledgeStore {
  constructor(protected readonly config: KnowledgeStoreConfig) {}

  abstract readonly stats: IndexStats;

  abstract init(): Promise<void>;
  abstract ingestBook(
    descriptor:  Omit<BookDescriptor, "chunkIds" | "createdAt">,
    rawChapters: Array<{ title: string; text: string }>,
  ): Promise<BookDescriptor>;
  abstract search(query: string, topK?: number): Promise<SearchResult[]>;
  abstract getChunks(bookId: string): Promise<DocumentChunk[]>;
  abstract deleteBook(bookId: string): Promise<void>;
  abstract upgradeEmbeddingModel(next: IEmbeddingModel): Promise<void>;
  abstract dispose(): void;

  /** Split raw text into overlapping chunks (shared helper). */
  protected chunkText(
    text:    string,
    size   = this.config.chunkSize   ?? 400,
    overlap= this.config.chunkOverlap ?? 80,
  ): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + size));
      i += size - overlap;
    }
    return chunks;
  }
}
