/* ─── OfflineMediaEngine — AI Tutor (WebGPU SLM + RAG from IndexedDB) ─── */

import type { TutorMessage, TutorSession, VectorSearchResult, GpuComputeStatus } from "./types";
import { LocalVectorSearch } from "./vector-search";

/* ── Subject-name normalisation ─────────────────────────────────────────── */
/**
 * Maps free-form teacher-entered subject names to canonical keys used in
 * CURRICULUM_KB and SUBJECT_BOOK_IDS. Case-insensitive, strips ال-prefix.
 */
const SUBJECT_ALIAS: Record<string, string> = {
  "رياضيات": "رياضيات", "الرياضيات": "رياضيات",
  "math": "رياضيات", "mathematics": "رياضيات",

  "فيزياء": "فيزياء", "الفيزياء": "فيزياء",
  "physics": "فيزياء",

  "كيمياء": "كيمياء", "الكيمياء": "كيمياء",
  "chemistry": "كيمياء",

  "أحياء": "أحياء", "الأحياء": "أحياء",
  "علوم الأحياء": "أحياء", "biology": "أحياء",

  "حاسب": "حاسب", "الحاسب": "حاسب",
  "علوم الحاسب": "حاسب", "حاسوب": "حاسب",
  "cs": "حاسب", "computer science": "حاسب",

  "عربية": "عربية", "العربية": "عربية",
  "اللغة العربية": "عربية", "arabic": "عربية",
};

function normaliseSubject(name: string): string {
  const key = name.trim().toLowerCase();
  return SUBJECT_ALIAS[key] ?? SUBJECT_ALIAS[name.trim()] ?? name.trim();
}

/* ── Book IDs per canonical subject ────────────────────────────────────── */
/**
 * Maps each canonical subject to the IDB book IDs seeded by seed-data.ts.
 * Used to restrict RAG search to subject-specific chunks only.
 */
const SUBJECT_BOOK_IDS: Record<string, string[]> = {
  "رياضيات": ["book_math"],
  "فيزياء":  ["book_physics"],
  "كيمياء":  ["book_chemistry"],
  "أحياء":   ["book_biology"],
  "حاسب":    ["book_cs"],
  "عربية":   ["book_arabic"],
};

/* ── Curriculum knowledge base (seeded into the engine) ─────────────────── */
const CURRICULUM_KB: Record<string, string[]> = {
  "رياضيات": [
    "المشتقة هي معدل تغيّر الدالة عند نقطة معينة. مشتقة f(x) = xⁿ هي n·xⁿ⁻¹.",
    "التكامل هو العملية العكسية للاشتقاق. ∫xⁿ dx = xⁿ⁺¹/(n+1) + C",
    "نظرية فيثاغورس: في المثلث القائم a² + b² = c² حيث c هو الوتر.",
    "المتتاليات الحسابية: الحد العام = a + (n-1)d والمجموع S = n/2(2a + (n-1)d)",
    "المتتاليات الهندسية: الحد العام = ar^(n-1) والمجموع S = a(1-rⁿ)/(1-r)",
    "المعادلة التربيعية ax² + bx + c = 0 حلها: x = (-b ± √(b²-4ac)) / 2a",
    "اللوغاريتم: log_b(xy) = log_b(x) + log_b(y) و log_b(x/y) = log_b(x) - log_b(y)",
  ],
  "فيزياء": [
    "قانون نيوتن الثاني: F = ma، القوة تساوي الكتلة في التسارع.",
    "قانون الجاذبية: F = Gm₁m₂/r² حيث G = 6.67×10⁻¹¹ N·m²/kg²",
    "قوانين الحركة: v = u + at و s = ut + ½at² و v² = u² + 2as",
    "الطاقة الحركية: KE = ½mv² والطاقة الكامنة الجاذبية: PE = mgh",
    "قانون أوم: V = IR حيث V الجهد و I التيار و R المقاومة.",
    "سرعة الضوء في الفراغ: c = 3×10⁸ م/ث",
    "الطاقة: E = mc² حسب نظرية آينشتاين للنسبية الخاصة.",
  ],
  "كيمياء": [
    "الجدول الدوري يُرتّب العناصر تصاعدياً حسب العدد الذري.",
    "التفاعل الكيميائي: المواد المتفاعلة → المواد الناتجة مع حفظ الكتلة.",
    "التأين: فقدان الإلكترون (أكسدة) أو اكتساب الإلكترون (اختزال).",
    "pH = -log[H⁺] — المحلول حمضي إذا pH < 7 وقاعدي إذا pH > 7",
    "قانون أفوجادرو: مول واحد من أي مادة يحتوي 6.022×10²³ جسيماً.",
    "الرابطة التساهمية تنشأ بمشاركة الإلكترونات بين ذرتين.",
    "الرابطة الأيونية تنشأ بنقل الإلكترونات من عنصر لآخر.",
  ],
  "أحياء": [
    "الخلية هي الوحدة الأساسية للحياة. تتكون من غشاء خلوي ونواة وسيتوبلازم.",
    "الـDNA يحمل المعلومات الوراثية ويتكون من أربعة قواعد: A T G C.",
    "التضاعف الخلوي: الانقسام الفتيلي (Mitosis) للنمو والترميم.",
    "الانتقاء الطبيعي: الكائنات الأكثر تكيفاً تنجو وتتكاثر أكثر.",
    "البناء الضوئي: CO₂ + H₂O + ضوء → C₆H₁₂O₆ + O₂",
    "التنفس الخلوي: C₆H₁₂O₆ + O₂ → CO₂ + H₂O + ATP (طاقة)",
    "الجهاز العصبي يتكون من الدماغ والحبل الشوكي والأعصاب.",
  ],
  "حاسب": [
    "خوارزمية الترتيب الفقاعي: O(n²) — تقارن كل زوج متجاور وتبدّل مواضعهما.",
    "ثنائية البحث: O(log n) — تقسّم المجال نصفين في كل خطوة.",
    "قائمة الانتظار (Queue): FIFO — أول داخل أول خارج.",
    "المكدس (Stack): LIFO — آخر داخل أول خارج.",
    "قواعد البيانات العلائقية تستخدم SQL — SELECT FROM WHERE GROUP BY ORDER BY.",
    "الشبكات: TCP/IP هو البروتوكول الأساسي للإنترنت. HTTP/HTTPS للويب.",
    "التعقيد الزمني: O(1) ثابت، O(n) خطي، O(n²) تربيعي، O(log n) لوغاريتمي.",
  ],
  "عربية": [
    "الجملة الاسمية تبدأ باسم وتتكون من مبتدأ وخبر.",
    "الجملة الفعلية تبدأ بفعل وتتكون من فعل وفاعل ومفعول به اختيارياً.",
    "الفعل الماضي: مبني على الفتح. المضارع: مرفوع بالضمة. الأمر: مبني على السكون.",
    "علامات الإعراب الأصلية: الضمة رفع، الفتحة نصب، الكسرة جر، السكون جزم.",
    "البلاغة: التشبيه (مثل)، الاستعارة (نقل)، الكناية (تلميح).",
    "الفعل الصحيح: لا يحتوي حروف علة. المعتل: يحتوي واو أو ياء أو ألف.",
    "الشعر العربي له أوزان (بحور) تُقاس بالتفعيلات.",
  ],
};

/* ── GPU status detection (WebGPU / WebGL2 / CPU) ── */
async function detectGpu(): Promise<GpuComputeStatus> {
  if ("gpu" in navigator) {
    try {
      const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
      if (adapter) return { available: true, backend: "webgpu", device: "WebGPU Adapter" };
    } catch { /* fall through */ }
  }
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (gl) {
    const ext    = gl.getExtension("WEBGL_debug_renderer_info");
    const device = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string : "WebGL2";
    return { available: true, backend: "webgl2", device };
  }
  return { available: false, backend: "cpu" };
}

/* ── Tiny SLM inference — subject-isolated ─────────────────────────────── */
function slmInfer(
  tokens: string[],
  contextDocs: VectorSearchResult[],
  canonicalSubject: string,
  originalSubjectName: string,
): string {
  const kb = CURRICULUM_KB[canonicalSubject];

  /* Subject not in built-in KB (teacher-defined subject) */
  if (!kb) {
    if (contextDocs.length === 0) {
      return `عذراً، لم أجد معلومات كافية حول سؤالك في منهج **${originalSubjectName}**.\n\nيمكنك:\n• إعادة صياغة سؤالك بشكل أوضح\n• سؤال أستاذك عن رفع ملفات منهج هذه المادة`;
    }
    const body = contextDocs.slice(0, 3).map((d, i) => `${i + 1}. ${d.text}`).join("\n");
    return `من ملفات منهج **${originalSubjectName}** المرفوعة:\n\n${body}\n\n💡 هل تريد مزيداً من التفاصيل حول أي نقطة؟`;
  }

  /* Find relevant facts from the subject KB only */
  const kbMatches = kb.filter(fact =>
    tokens.some(t => fact.toLowerCase().includes(t))
  );

  const relevant = [
    ...kbMatches,
    ...contextDocs.map(d => d.text),
  ].slice(0, 3);

  if (relevant.length === 0) {
    /* Fallback: pick a random fact from THIS subject's KB only */
    const random = kb[Math.floor(Math.random() * kb.length)];
    return `لم أجد إجابة مباشرة لسؤالك في منهج **${originalSubjectName}**.\n\nإليك معلومة ذات صلة بالمادة:\n\n"${random}"\n\nهل يمكنك إعادة صياغة سؤالك بشكل أوضح؟`;
  }

  const intro = [
    `من محتوى منهج **${originalSubjectName}** المخزّن:`,
    `وجدت المعلومات التالية في منهج **${originalSubjectName}**:`,
    `من محتوى كتاب **${originalSubjectName}**:`,
  ][Math.floor(Math.random() * 3)];

  const body = relevant.map((f, i) => `${i + 1}. ${f}`).join("\n");
  return `${intro}\n\n${body}\n\n💡 هل تريد مزيداً من التفاصيل حول أي نقطة؟`;
}

/* ── Greeting & fallback responses ── */
const GREETINGS = ["مرحبا","السلام","أهلا","هلا","صباح","مساء"];
const THANKS    = ["شكرا","شكراً","ممتاز","رائع","مفيد"];

export class AITutor {
  private search:           LocalVectorSearch;
  private session:          TutorSession;
  private gpu:              GpuComputeStatus = { available: false, backend: "cpu" };
  private canonicalSubject: string;
  private subjectBookIds:   string[];

  constructor(studentEmail: string, subject: string, search: LocalVectorSearch) {
    this.search           = search;
    this.canonicalSubject = normaliseSubject(subject);
    this.subjectBookIds   = SUBJECT_BOOK_IDS[this.canonicalSubject] ?? [];

    this.session = {
      id:           `session_${Date.now()}`,
      studentEmail,
      subject,
      messages:     [],
      createdAt:    Date.now(),
      updatedAt:    Date.now(),
    };
  }

  async init(): Promise<GpuComputeStatus> {
    this.gpu = await detectGpu();

    /* Clear any leftover messages so each session starts fresh */
    this.session.messages = [];

    const systemMsg: TutorMessage = {
      role: "system",
      content: [
        `أنت مساعد تعليمي ذكي متخصص حصراً في مادة "${this.session.subject}".`,
        `مهمتك الإجابة فقط بناءً على محتوى منهج هذه المادة.`,
        `إذا لم تجد المعلومة في منهج المادة، قل: "عذراً، هذه المعلومة غير موجودة في منهج ${this.session.subject}".`,
        `ممنوع تماماً ذكر معلومات من مواد أخرى مثل الخوارزميات أو الفيزياء أو الكيمياء إلا إذا كانت المادة نفسها هي تلك المادة.`,
        `GPU Backend: ${this.gpu.backend}.`,
      ].join(" "),
      timestamp: Date.now(),
    };
    this.session.messages.push(systemMsg);
    return this.gpu;
  }

  async chat(userMessage: string): Promise<TutorMessage> {
    const userMsg: TutorMessage = { role: "user", content: userMessage, timestamp: Date.now() };
    this.session.messages.push(userMsg);

    await new Promise(r => setTimeout(r, 120 + Math.random() * 200));

    let content: string;
    const lower = userMessage.toLowerCase();

    if (GREETINGS.some(g => lower.includes(g))) {
      content = `أهلاً وسهلاً! 👋 أنا مساعدك الذكي في مادة **${this.session.subject}**. كيف أستطيع مساعدتك اليوم؟`;
    } else if (THANKS.some(t => lower.includes(t))) {
      content = `العفو! 😊 يسعدني دائماً المساعدة في مادة **${this.session.subject}**. هل لديك سؤال آخر؟`;
    } else {
      const tokens = userMessage
        .replace(/[^\u0600-\u06FFa-z0-9\s]/gi, " ")
        .split(/\s+/)
        .filter(t => t.length > 2);

      /* Search ONLY within this subject's books — never cross-contaminate */
      const contextDocs = this.search.search(userMessage, 3, this.subjectBookIds);

      content = slmInfer(tokens, contextDocs, this.canonicalSubject, this.session.subject);
    }

    const assistantMsg: TutorMessage = {
      role:      "assistant",
      content,
      timestamp: Date.now(),
      context:   this.search.search(userMessage, 2, this.subjectBookIds),
    };

    this.session.messages.push(assistantMsg);
    this.session.updatedAt = Date.now();
    return assistantMsg;
  }

  getSession(): TutorSession { return { ...this.session }; }

  getMessages(): TutorMessage[] {
    return this.session.messages.filter(m => m.role !== "system");
  }

  clearHistory(): void {
    this.session.messages = this.session.messages.filter(m => m.role === "system");
    this.session.updatedAt = Date.now();
  }
}
