/* ─── OfflineMediaEngine — Shared Types ─── */

export interface EncryptedBlob {
  iv: string;
  data: string;
  keyId: string;
  algorithm: "AES-GCM";
}

export interface TTSVoice {
  id: string;
  name: string;
  lang: string;
  localService: boolean;
}

export interface TTSOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: TTSVoice;
  onWord?: (word: string, charIndex: number) => void;
  onEnd?: () => void;
}

export interface TTSState {
  speaking: boolean;
  paused: boolean;
  currentWord: string;
  charIndex: number;
  voices: TTSVoice[];
}

export interface TextChunk {
  id: string;
  bookId: string;
  chapterIndex: number;
  chunkIndex: number;
  text: string;
  tokens: string[];
  tfidf: number[];
  encrypted?: EncryptedBlob;
}

export interface BookMetadata {
  id: string;
  title: string;
  subject: string;
  author: string;
  pages: number;
  chapters: string[];
  createdAt: string;
  encrypted: boolean;
  keyId?: string;
  /* ── i18n multilingual fields ── */
  language?: "ar" | "en";      // primary language of this book's content
  title_ar?: string;
  title_en?: string;
}

export interface BookContent extends BookMetadata {
  chunks: TextChunk[];
}

export interface VectorSearchResult {
  chunkId: string;
  bookId: string;
  chapterIndex: number;
  text: string;
  score: number;
  highlight: string;
}

export interface TutorMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  context?: VectorSearchResult[];
}

export interface TutorSession {
  id: string;
  studentEmail: string;
  subject: string;
  messages: TutorMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface GpuComputeStatus {
  available: boolean;
  backend: "webgpu" | "webgl2" | "cpu";
  device?: string;
}

export interface MediaEngineCapabilities {
  tts: boolean;
  ttsVoices: number;
  arabicVoice: boolean;
  englishVoice: boolean;       // bilingual: EN TTS support
  supportedLangs: string[];    // e.g. ["ar", "en", "fr"]
  indexedDB: boolean;
  gpu: GpuComputeStatus;
  crypto: boolean;
  workerThreads: boolean;
}

export interface SandboxedContext {
  id: string;
  origin: string;
  permissions: string[];
  isolated: boolean;
}
