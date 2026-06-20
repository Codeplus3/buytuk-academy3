/* ─── OfflineMediaEngine — Local Vector Search (TF-IDF + Cosine Similarity) ─── */

import type { TextChunk, VectorSearchResult } from "./types";

/** Arabic stop-words */
const STOP_WORDS = new Set([
  "من","إلى","في","على","عن","مع","هذا","هذه","ذلك","تلك","التي","الذي","الذين",
  "وهو","وهي","أن","إن","كان","كانت","لكن","أو","و","ف","ب","ل","ك","لا","ما",
  "هي","هو","هم","أنا","نحن","أنت","أنتم","قد","كل","بعض","حيث","عند","بين",
  "the","a","an","is","are","was","were","in","on","at","to","of","and","or",
]);

/** Tokenise Arabic + Latin text into normalised stems */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(t => t.replace(/^(ال|وال|فال|بال|كال)/, ""))
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

/** Build TF vector for a list of tokens */
function termFrequency(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  const total = tokens.length || 1;
  for (const t in tf) tf[t] /= total;
  return tf;
}

/** Cosine similarity between two TF maps */
function cosineSim(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const t in a) {
    dot   += a[t] * (b[t] ?? 0);
    normA += a[t] * a[t];
  }
  for (const t in b) normB += b[t] * b[t];
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Extract a highlighted snippet around the best matching term */
function highlight(text: string, queryTokens: string[]): string {
  const lower = text.toLowerCase();
  let best = -1;
  for (const t of queryTokens) {
    const idx = lower.indexOf(t);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  if (best === -1) return text.slice(0, 140) + "…";
  const start = Math.max(0, best - 40);
  const end   = Math.min(text.length, best + 100);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

interface IndexedChunk {
  chunk: TextChunk;
  tf: Record<string, number>;
  idf: Record<string, number>;
  tfidfVec: Record<string, number>;
}

export class LocalVectorSearch {
  private index: IndexedChunk[] = [];
  private idf: Record<string, number> = {};

  /** Build the full inverted index from loaded chunks */
  buildIndex(chunks: TextChunk[]): void {
    const tokenised: { chunk: TextChunk; tf: Record<string, number> }[] = [];
    const df: Record<string, number> = {};

    for (const chunk of chunks) {
      const tokens = tokenise(chunk.text);
      const tf     = termFrequency(tokens);
      tokenised.push({ chunk, tf });
      for (const t in tf) df[t] = (df[t] ?? 0) + 1;
    }

    const N = chunks.length || 1;
    this.idf = {};
    for (const t in df) this.idf[t] = Math.log((N + 1) / (df[t] + 1)) + 1;

    this.index = tokenised.map(({ chunk, tf }) => {
      const tfidfVec: Record<string, number> = {};
      for (const t in tf) tfidfVec[t] = tf[t] * (this.idf[t] ?? 1);
      return { chunk, tf, idf: this.idf, tfidfVec };
    });
  }

  /**
   * Semantic search: returns top-K results ranked by TF-IDF cosine similarity.
   * Pass `bookIds` to restrict results to specific books (subject isolation).
   */
  search(query: string, topK = 5, bookIds?: string[]): VectorSearchResult[] {
    if (this.index.length === 0) return [];

    const candidates = bookIds && bookIds.length > 0
      ? this.index.filter(c => bookIds.includes(c.chunk.bookId))
      : this.index;

    if (candidates.length === 0) return [];

    const qTokens = tokenise(query);
    const qTF     = termFrequency(qTokens);
    const qVec: Record<string, number> = {};
    for (const t in qTF) qVec[t] = qTF[t] * (this.idf[t] ?? 1);

    const scored = candidates.map(({ chunk, tfidfVec }) => ({
      chunk,
      score: cosineSim(qVec, tfidfVec),
    }));

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => ({
        chunkId:      s.chunk.id,
        bookId:       s.chunk.bookId,
        chapterIndex: s.chunk.chapterIndex,
        text:         s.chunk.text,
        score:        Math.round(s.score * 1000) / 1000,
        highlight:    highlight(s.chunk.text, qTokens),
      }));
  }

  get size(): number { return this.index.length; }
}
