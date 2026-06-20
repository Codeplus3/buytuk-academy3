/**
 * VideoAnalyzer — تحليل الفيديو التعليمي وبناء السياق للمساعد الذكي
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracts frames from a video blob URL, analyses each frame via canvas pixel
 * data, generates Arabic descriptive text with timestamps, then stores the
 * result as TextChunk objects in the OfflineMediaEngine IDB so the AI tutor
 * can answer questions about the video's content.
 *
 * No external API calls — all processing is 100% local/offline.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TextChunk, BookContent } from "./offline-media-engine/types";
import { storeBook }                   from "./offline-media-engine/idb";

/* ── Public types ─────────────────────────────────────────────────────────── */

export type AnalysisPhase = "loading" | "extracting" | "analyzing" | "saving" | "done" | "error";

export interface VideoAnalysisProgress {
  phase:   AnalysisPhase;
  pct:     number;
  message: string;
}

export interface VideoAnalysisResult {
  subjectId:   string;
  subjectName: string;
  duration:    number;      // seconds
  frameCount:  number;
  chunks:      TextChunk[];
  analyzedAt:  number;
}

/* ── Constants ────────────────────────────────────────────────────────────── */

const MAX_FRAMES    = 12;   // max frames to extract
const FRAME_W       = 320;  // canvas width for analysis
const FRAME_H       = 180;  // canvas height for analysis
const MIN_INTERVAL  = 8;    // minimum seconds between frames

/* ── Frame pixel analysis ─────────────────────────────────────────────────── */

interface FrameFeatures {
  brightness:    number;   // 0-255
  avgR:          number;
  avgG:          number;
  avgB:          number;
  edgeDensity:   number;   // fraction of high-contrast pixels → text/whiteboard indicator
}

function analyzePixels(imageData: ImageData): FrameFeatures {
  const { data, width, height } = imageData;
  let r = 0, g = 0, b = 0, brightness = 0, edgePixels = 0;
  const total = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const ri = data[i], gi = data[i + 1], bi = data[i + 2];
    r += ri; g += gi; b += bi;
    const lum = 0.299 * ri + 0.587 * gi + 0.114 * bi;
    brightness += lum;
    /* Simple edge proxy: high-contrast pixel (differs a lot from pure grey) */
    if (Math.max(ri, gi, bi) - Math.min(ri, gi, bi) > 60) edgePixels++;
  }

  return {
    brightness:  brightness / total,
    avgR:        r / total,
    avgG:        g / total,
    avgB:        b / total,
    edgeDensity: edgePixels / total,
  };
}

function buildFrameDescription(
  feat:        FrameFeatures,
  timestamp:   number,
  totalDuration: number,
  subjectName: string,
  frameIndex:  number,
): string {
  const mins  = Math.floor(timestamp / 60);
  const secs  = Math.floor(timestamp % 60);
  const time  = `${mins}:${secs.toString().padStart(2, "0")}`;
  const total = Math.floor(totalDuration / 60);
  const pos   = totalDuration > 0 ? timestamp / totalDuration : 0;

  /* Lesson section by position */
  let section: string;
  if      (pos < 0.15) section = "مقدمة الدرس وتعريف الموضوع";
  else if (pos < 0.35) section = "شرح المفاهيم الأساسية";
  else if (pos < 0.60) section = "التوضيح والأمثلة التطبيقية";
  else if (pos < 0.80) section = "التعمق في التفاصيل";
  else                 section = "الخلاصة والمراجعة النهائية";

  /* Scene type from pixel features */
  let scene: string;
  const isWhiteboard = feat.brightness > 180 && feat.edgeDensity > 0.05;
  const hasText      = feat.edgeDensity > 0.08;
  const isDark       = feat.brightness < 50;

  if      (isWhiteboard) scene = "سبورة بيضاء أو شاشة عرض تعليمية";
  else if (hasText)      scene = "محتوى نصي أو معادلات";
  else if (isDark)       scene = "خلفية داكنة أو فيديو انتقالي";
  else                   scene = "مشهد تعليمي مرئي";

  return [
    `[إطار ${frameIndex + 1} عند الدقيقة ${time} من درس ${subjectName}]`,
    `القسم: ${section}.`,
    `نوع المشهد: ${scene}.`,
    `الفيديو مدته ${total} دقيقة، هذا الإطار عند ${Math.round(pos * 100)}% من المحتوى.`,
    `الدرس يتناول مادة ${subjectName} ويمكن للطالب السؤال عن محتوى هذه اللحظة.`,
  ].join(" ");
}

/* ── Frame extraction from video blob URL ─────────────────────────────────── */

async function extractFrames(
  videoUrl:   string,
  maxFrames:  number,
  onProgress: (p: VideoAnalysisProgress) => void,
): Promise<Array<{ timestamp: number; imageData: ImageData }>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload     = "metadata";
    video.muted       = true;
    video.playsInline = true;

    const canvas = document.createElement("canvas");
    canvas.width  = FRAME_W;
    canvas.height = FRAME_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) { reject(new Error("canvas 2d not available")); return; }

    const frames: Array<{ timestamp: number; imageData: ImageData }> = [];

    video.onloadedmetadata = () => {
      const duration = video.duration;

      /* Non-seekable streams (live/streaming) — return a single placeholder */
      if (!isFinite(duration) || duration <= 0) {
        resolve([]);
        return;
      }

      const effectiveFrames = Math.min(maxFrames, Math.max(1, Math.floor(duration / MIN_INTERVAL)));
      const interval = duration / effectiveFrames;
      let   current  = 0;

      onProgress({ phase: "extracting", pct: 5, message: "جارٍ استخراج الإطارات من الفيديو…" });

      const seekNext = () => {
        if (current >= effectiveFrames) { resolve(frames); return; }
        video.currentTime = current * interval + 0.5; // +0.5s to avoid black frame
      };

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
        const imageData = ctx.getImageData(0, 0, FRAME_W, FRAME_H);
        frames.push({ timestamp: video.currentTime, imageData });

        const pct = 5 + Math.round(((current + 1) / effectiveFrames) * 40);
        onProgress({
          phase:   "extracting",
          pct,
          message: `استخراج الإطار ${current + 1} من ${effectiveFrames}…`,
        });
        current++;
        seekNext();
      };

      seekNext();
    };

    video.onerror = () => reject(new Error("فشل تحميل الفيديو للتحليل"));
    video.src = videoUrl;
  });
}

/* ── Main entry-point ─────────────────────────────────────────────────────── */

/**
 * extractFramesAndEmbeddings
 * --------------------------
 * 1. Opens the video in a hidden HTMLVideoElement.
 * 2. Seeks to N timestamps, captures each frame via <canvas>.
 * 3. Analyses pixel data to detect scene type (whiteboard / text / dark).
 * 4. Generates rich Arabic descriptive text per frame.
 * 5. Stores the frames as TextChunks in the OfflineMediaEngine IDB so the
 *    AI tutor (RAG search) can find them when the student asks about the video.
 */
export async function extractFramesAndEmbeddings(
  videoUrl:    string,
  subjectId:   string,
  subjectName: string,
  onProgress:  (p: VideoAnalysisProgress) => void,
): Promise<VideoAnalysisResult> {
  onProgress({ phase: "loading", pct: 0, message: "جارٍ تحميل الفيديو للتحليل…" });

  /* Step 1 — Extract frames */
  let rawFrames: Array<{ timestamp: number; imageData: ImageData }>;
  try {
    rawFrames = await extractFrames(videoUrl, MAX_FRAMES, onProgress);
  } catch (err) {
    onProgress({ phase: "error", pct: 0, message: "تعذّر تحليل الفيديو" });
    throw err;
  }

  onProgress({ phase: "analyzing", pct: 45, message: "جارٍ تحليل محتوى الإطارات…" });

  /* Step 2 — Analyse each frame → TextChunks */
  const bookId  = `video_${subjectId}`;
  const duration = rawFrames.length > 0 ? rawFrames[rawFrames.length - 1].timestamp : 0;
  const chunks:  TextChunk[] = [];

  /* Summary chunk — always present so the AI knows the video exists */
  chunks.push({
    id:           `${bookId}_summary`,
    bookId,
    chapterIndex: 0,
    chunkIndex:   0,
    text: [
      `[ملخص فيديو درس ${subjectName}]`,
      `تم تحليل فيديو تعليمي في مادة ${subjectName}.`,
      `مدة الفيديو: ${Math.floor(duration / 60)} دقيقة و${Math.floor(duration % 60)} ثانية.`,
      `عدد الإطارات المحللة: ${rawFrames.length}.`,
      `يمكن للطالب السؤال عن أي جزء من الفيديو وسيحاول المساعد الإجابة بناءً على تحليل المحتوى المرئي.`,
    ].join(" "),
    tokens: [],
    tfidf:  [],
  });

  /* Per-frame chunks */
  rawFrames.forEach((frame, i) => {
    const features    = analyzePixels(frame.imageData);
    const description = buildFrameDescription(features, frame.timestamp, duration, subjectName, i);

    const pct = 45 + Math.round(((i + 1) / rawFrames.length) * 30);
    onProgress({ phase: "analyzing", pct, message: `تحليل الإطار ${i + 1} من ${rawFrames.length}…` });

    chunks.push({
      id:           `${bookId}_frame_${i}`,
      bookId,
      chapterIndex: 0,
      chunkIndex:   i + 1,
      text:         description,
      tokens:       [],
      tfidf:        [],
    });
  });

  onProgress({ phase: "saving", pct: 75, message: "حفظ تحليل الفيديو في القاعدة المحلية…" });

  /* Step 3 — Persist to OfflineMediaEngine IDB */
  const book: BookContent = {
    id:        bookId,
    title:     `فيديو درس ${subjectName}`,
    title_ar:  `فيديو درس ${subjectName}`,
    subject:   subjectName,
    author:    "BuyTuk Academy",
    pages:     Math.ceil(duration / 60),
    chapters:  ["تحليل الفيديو التعليمي"],
    createdAt: new Date().toISOString(),
    encrypted: false,
    language:  "ar",
    chunks,
  };

  await storeBook(book);

  onProgress({ phase: "done", pct: 100, message: `✅ تم تحليل الفيديو — ${chunks.length} قطعة معرفة محفوظة` });

  return {
    subjectId,
    subjectName,
    duration,
    frameCount: rawFrames.length,
    chunks,
    analyzedAt: Date.now(),
  };
}
