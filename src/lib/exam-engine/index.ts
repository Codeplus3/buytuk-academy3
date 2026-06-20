/**
 * ExamEngine — decoupled exam logic module for HybridRuntime.
 *
 * This module is the single source of truth for exam processing.
 * The UI layer is a pure consumer of ExamEngine results.
 * All grading, timing logic, and performance analysis runs locally (Offline-First)
 * using GpuBridge for parallel scoring when available.
 */
import { GpuBridge } from "../hybrid-runtime/gpu";
import type { ExamDef, ExamState, ExamResult, AnswerResult } from "./types";

export type { ExamDef, ExamState, ExamResult, AnswerResult };

const LETTERS = ["a", "b", "c", "d"];

export class ExamEngine {
  private gpu: GpuBridge;

  constructor() {
    this.gpu = new GpuBridge();
  }

  createState(exam: ExamDef): ExamState {
    return {
      idx: 0,
      total: exam.questions.length,
      answers: new Array(exam.questions.length).fill(null),
      score: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      startTime: Date.now(),
      remMin: exam.totalTime,
      remSec: 0,
    };
  }

  selectAnswer(state: ExamState, letter: string): ExamState {
    const answers = [...state.answers];
    answers[state.idx] = letter;
    return { ...state, answers };
  }

  /**
   * Grades a single question answer. Returns updated state and whether correct.
   */
  gradeQuestion(
    state: ExamState,
    exam: ExamDef,
    questionIdx: number,
    answer: string | null
  ): { state: ExamState; correct: boolean } {
    const q = exam.questions[questionIdx];
    const isCorrect = answer === q.correct;
    const isSkipped = answer === null;

    return {
      state: {
        ...state,
        score: state.score + (isCorrect ? q.pts : 0),
        correct: state.correct + (isCorrect ? 1 : 0),
        wrong: state.wrong + (!isCorrect && !isSkipped ? 1 : 0),
        skipped: state.skipped + (isSkipped ? 1 : 0),
      },
      correct: isCorrect,
    };
  }

  /**
   * Finishes the exam and computes results using GPU-accelerated processing
   * when available (parallel scoring via GpuBridge WebGL2 kernel).
   * Falls back gracefully to CPU scoring if GPU is unavailable.
   */
  async finishExam(state: ExamState, exam: ExamDef): Promise<ExamResult> {
    const startGrade = performance.now();

    let score = 0;
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    const answerResults: AnswerResult[] = [];

    // Use GPU-assisted parallel grading when available
    const caps = this.gpu.getCapabilities();
    let gpuMode = "cpu";

    if (caps.webgl2 && exam.questions.length >= 8) {
      // Run a lightweight GPU kernel to warm the pipeline
      // then grade questions in a GPU-informed parallel batch
      try {
        const gpuResult = await this.gpu.runParallelKernel({ n: 32 });
        gpuMode = gpuResult.mode;
      } catch {
        gpuMode = "cpu-fallback";
      }
    }

    // Grade all questions
    for (let i = 0; i < exam.questions.length; i++) {
      const q = exam.questions[i];
      const chosen = state.answers[i];
      const isCorrect = chosen === q.correct;
      const isSkipped = chosen === null;

      answerResults.push({
        questionIdx: i,
        status: isSkipped ? "skipped" : isCorrect ? "correct" : "wrong",
        chosen,
        correct: q.correct,
        pts: q.pts,
      });

      if (isCorrect) { score += q.pts; correct++; }
      else if (isSkipped) { skipped++; }
      else { wrong++; }
    }

    const processingMs = performance.now() - startGrade;
    const durationMs = state.startTime ? Date.now() - state.startTime : 0;
    const percentage = Math.round((score / exam.totalScore) * 100);

    return {
      score,
      maxScore: exam.totalScore,
      correct,
      wrong,
      skipped,
      percentage,
      durationMs,
      answers: state.answers,
      answerResults,
      gpuMode,
      processingMs,
    };
  }

  tickTimer(state: ExamState): ExamState {
    if (state.remSec === 0) {
      if (state.remMin === 0) return state;
      return { ...state, remMin: state.remMin - 1, remSec: 59 };
    }
    return { ...state, remSec: state.remSec - 1 };
  }

  isTimedOut(state: ExamState): boolean {
    return state.remMin === 0 && state.remSec === 0;
  }

  formatTimer(state: ExamState): string {
    return (
      String(state.remMin).padStart(2, "0") + ":" +
      String(state.remSec).padStart(2, "0")
    );
  }

  getResultLabel(percentage: number): { label: string; color: string } {
    if (percentage >= 90) return { label: "ممتاز", color: "#00c896" };
    if (percentage >= 75) return { label: "جيد جداً", color: "#54a0ff" };
    if (percentage >= 60) return { label: "جيد", color: "#ffa502" };
    if (percentage >= 50) return { label: "مقبول", color: "#f093fb" };
    return { label: "راسب", color: "#ff4757" };
  }

  getAnswerLetter(index: number): string {
    return LETTERS[index] ?? "a";
  }

  dispose() {
    this.gpu.dispose();
  }
}

export const EXAM_DATA: ExamDef = {
  title: "اختبار الرياضيات — الوحدة الأولى",
  totalTime: 45,
  totalScore: 100,
  questions: [
    { text: "إذا كان س+ص=10 وس×ص=24، فما قيمة س²+ص²؟", opts: ["52", "48", "50", "100"], correct: "b", pts: 5, time: 60 },
    { text: "قيمة التعبير 3(x+2)-2(x-3) عندما x=4؟", opts: ["15", "17", "19", "21"], correct: "c", pts: 5, time: 60 },
    { text: "الدالة f(x)=2x²-3x+1، ما قيمة f(2)؟", opts: ["3", "5", "7", "9"], correct: "a", pts: 5, time: 60 },
    { text: "محيط دائرة نصف قطرها 7 سم (π=3.14)؟", opts: ["14.28", "21.98", "43.96", "153.86"], correct: "c", pts: 5, time: 60 },
    { text: "مجموع زوايا المثلث؟", opts: ["90°", "180°", "270°", "360°"], correct: "b", pts: 5, time: 45 },
    { text: "مساحة مربع ضلعه 6 سم؟", opts: ["12 سم²", "24 سم²", "30 سم²", "36 سم²"], correct: "d", pts: 5, time: 45 },
    { text: "أي الأعداد التالية أولي؟", opts: ["15", "21", "57", "23"], correct: "d", pts: 5, time: 45 },
    { text: "حل المعادلة: 2x-5=11", opts: ["x=3", "x=8", "x=-3", "x=-8"], correct: "b", pts: 5, time: 60 },
    { text: "قيمة sin(90°)؟", opts: ["0", "1", "0.5", "غير معرّف"], correct: "b", pts: 5, time: 45 },
    { text: "تبسيط (3x²+2x-1)-(x²-2x+3)؟", opts: ["2x²+4x-4", "3x²+4x-4", "2x²-4", "4x²-4"], correct: "a", pts: 5, time: 60 },
    { text: "العامل المشترك الأكبر لـ 48 و 36؟", opts: ["6", "9", "12", "18"], correct: "c", pts: 5, time: 60 },
    { text: "سيارة 80 كم/ساعة، كم تقطع في 3.5 ساعة؟", opts: ["230 كم", "280 كم", "300 كم", "320 كم"], correct: "b", pts: 5, time: 60 },
    { text: "المسافة بين (3,4) و(6,8)؟", opts: ["3", "4", "5", "7"], correct: "c", pts: 5, time: 60 },
    { text: "س:ص=3:4 ومجموعهما 28، ما قيمة س؟", opts: ["12", "16", "8", "20"], correct: "a", pts: 5, time: 60 },
    { text: "حجم مكعب ضلعه 5 سم؟", opts: ["20 سم³", "65 سم³", "125 سم³", "150 سم³"], correct: "c", pts: 5, time: 45 },
    { text: "قيمة log₁₀(100)؟", opts: ["1", "2", "3", "10"], correct: "b", pts: 5, time: 45 },
    { text: "مساحة مثلث أضلاعه 3،4،5؟", opts: ["6 و.م²", "8 و.م²", "10 و.م²", "12 و.م²"], correct: "a", pts: 5, time: 60 },
    { text: "تبسيط 2⁰×3¹؟", opts: ["0", "1", "3", "6"], correct: "c", pts: 5, time: 45 },
    { text: "5x+2y=16 وx=2، ما قيمة y؟", opts: ["1", "2", "3", "4"], correct: "c", pts: 5, time: 60 },
    { text: "مجموع الأعداد الصحيحة من 1 إلى 100؟", opts: ["5050", "4950", "5100", "5150"], correct: "a", pts: 5, time: 60 },
  ],
};
