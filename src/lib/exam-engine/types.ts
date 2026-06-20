export interface Question {
  text: string;
  opts: string[];
  correct: "a" | "b" | "c" | "d";
  pts: number;
  time: number;
}

export interface ExamDef {
  title: string;
  totalTime: number;
  totalScore: number;
  questions: Question[];
}

export interface ExamState {
  idx: number;
  total: number;
  answers: (string | null)[];
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
  startTime: number | null;
  remMin: number;
  remSec: number;
}

export interface AnswerResult {
  questionIdx: number;
  status: "correct" | "wrong" | "skipped";
  chosen: string | null;
  correct: string;
  pts: number;
}

export interface ExamResult {
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  skipped: number;
  percentage: number;
  durationMs: number;
  answers: (string | null)[];
  answerResults: AnswerResult[];
  gpuMode: string;
  processingMs: number;
}
