/**
 * BookTextReader — قارئ نصي تفاعلي داخل BookViewer
 * ─────────────────────────────────────────────────────────────────────────────
 * يعرض محتوى الكتاب كفصول وفقرات قابلة للقراءة مع:
 *  - فهرس فصول قابل للنقر (sidebar)
 *  - تقدم القراءة (progress bar)
 *  - تمييز الفقرة الحالية
 *  - استماع صوتي لكل فقرة (Web Speech API)
 *  - إعدادات الخط (حجم، وضع ليلي/نهاري للمحتوى)
 *  - حفظ الموضع في localStorage
 */

import { useState, useEffect, useRef } from "react";
import type { BookMetadata, TextChunk } from "../lib/offline-media-engine";
import { OfflineMediaEngine } from "../lib/offline-media-engine";
import { VOICES } from "./VoiceProfilesPanel";

const engine = OfflineMediaEngine.getInstance();
const ACTIVE_KEY = "buytuk_active_voice";

interface Props {
  subject:      string;
  subjectIcon:  string;
  card:         React.CSSProperties;
}

/* ── الفصول المدمجة (seed-data) لكل مادة ─────────────────────────────── */
const SUBJECT_CHAPTERS: Record<string, { title: string; text: string }[]> = {
  "رياضيات": [
    { title: "الاشتقاق والتكامل", text: "المشتقة هي معدل تغيّر الدالة عند نقطة معينة وتُكتب f'(x) أو dy/dx.\n\nمشتقة الدالة الأسية f(x) = xⁿ هي n·xⁿ⁻¹. التكامل هو العملية العكسية للاشتقاق.\n\n∫xⁿ dx = xⁿ⁺¹/(n+1) + C\n\nقاعدة السلسلة: إذا كانت y = f(g(x)) فإن dy/dx = f'(g(x))·g'(x).\n\nالتكامل المحدود يحسب المساحة تحت المنحنى بين حدّين، وهو أداة أساسية في الفيزياء والهندسة والاقتصاد." },
    { title: "المعادلات التربيعية", text: "المعادلة التربيعية هي ax² + bx + c = 0 حيث a ≠ 0.\n\nالحل بالمعادلة العامة: x = (-b ± √(b²-4ac)) / 2a\n\nالمميّز (Δ) = b²-4ac يحدد طبيعة الجذور:\n• إذا Δ > 0 فجذران حقيقيان مختلفان\n• إذا Δ = 0 فجذران حقيقيان متساويان\n• إذا Δ < 0 فلا جذور حقيقية (جذران مركّبان)\n\nيمكن حل المعادلة أيضاً بالتحليل إلى عوامل أو بإكمال المربع." },
    { title: "المتتاليات والمتسلسلات", text: "المتتالية الحسابية: الفرق بين أي حدّين متتاليين ثابت ويُسمى الأساس d.\n\nالحد العام: aₙ = a₁ + (n-1)d\nمجموع n حداً: Sₙ = n/2·(2a₁ + (n-1)d)\n\nالمتتالية الهندسية: النسبة بين أي حدّين متتاليين ثابتة وتُسمى r.\n\nالحد العام: aₙ = a₁·r^(n-1)\nمجموع n حداً: Sₙ = a₁(1-rⁿ)/(1-r) إذا r≠1\n\nالمتسلسلة اللانهائية تتقارب إذا كان |r| < 1 والمجموع = a₁/(1-r)." },
    { title: "الهندسة التحليلية", text: "المسافة بين نقطتين (x₁,y₁) و (x₂,y₂):\nd = √((x₂-x₁)² + (y₂-y₁)²)\n\nنقطة المنتصف: M = ((x₁+x₂)/2 , (y₁+y₂)/2)\n\nميل الخط: m = (y₂-y₁)/(x₂-x₁)\nمعادلة الخط بميل ونقطة: y - y₁ = m(x - x₁)\n\nالدائرة بمركز (h,k) وشعاع r:\n(x-h)² + (y-k)² = r²" },
    { title: "اللوغاريتمات", text: "اللوغاريتم هو العملية العكسية للأس.\nlog_b(x) = y ⟺ b^y = x\n\nقواعد اللوغاريتم الأساسية:\n• log(x·y) = log(x) + log(y)\n• log(x/y) = log(x) - log(y)\n• log(xⁿ)  = n·log(x)\n\nقاعدة تحويل الأساس: log_b(x) = log(x)/log(b)\n\nاللوغاريتم الطبيعي: ln(x) = log_e(x) حيث e ≈ 2.71828" },
  ],
  "فيزياء": [
    { title: "قوانين نيوتن للحركة", text: "القانون الأول — قانون القصور الذاتي:\nالجسم الساكن يبقى ساكناً والجسم المتحرك يستمر بسرعة ثابتة في خط مستقيم ما لم تؤثر عليه قوة خارجية.\n\nالقانون الثاني:\nF = m·a\nالقوة المحصلة تساوي حاصل ضرب الكتلة في التسارع.\n\nالقانون الثالث:\nلكل فعل ردّ فعل مساوٍ له في المقدار ومعاكس له في الاتجاه." },
    { title: "قوانين الحركة الخطية", text: "معادلات الحركة المنتظمة التسارع:\n• v = u + at\n• s = ut + ½at²\n• v² = u² + 2as\n\nحيث:\nu = السرعة الابتدائية\nv = السرعة النهائية\na = التسارع\nt = الزمن\ns = الإزاحة\n\nفي السقوط الحر: a = g = 9.8 م/ث²\n\nالحركة القذفية تُحلَّل إلى مركّبتين مستقلتين: أفقية (بدون تسارع) وعمودية (بتسارع g)." },
    { title: "الشغل والطاقة", text: "الشغل = القوة × الإزاحة × cos(θ)\nيُقاس بالجول (J)\n\nالطاقة الحركية: KE = ½mv²\nالطاقة الكامنة الجاذبية: PE = mgh\n\nقانون حفظ الطاقة:\nالطاقة الكلية ثابتة في الأنظمة المعزولة.\nKE + PE = ثابت\n\nالقدرة = الشغل / الزمن\nوتُقاس بالواط (W) = جول/ثانية." },
    { title: "الكهرباء والمغناطيسية", text: "قانون أوم: V = I·R\nV = الجهد (فولت)، I = التيار (أمبير)، R = المقاومة (أوم)\n\nالمقاومات على التوالي: R = R₁ + R₂ + R₃\nالمقاومات على التوازي: 1/R = 1/R₁ + 1/R₂ + 1/R₃\n\nقانون كيرشهوف الأول:\nمجموع التيارات الداخلة لأي نقطة = مجموع التيارات الخارجة\n\nقانون كولوم: F = k·q₁q₂/r²" },
    { title: "الموجات والصوت والضوء", text: "الموجة تتوصف بثلاثة مقادير:\n• التردد f (هرتز)\n• الطول الموجي λ (متر)\n• السرعة v = f·λ\n\nالصوت موجة ميكانيكية طولية تسير في الهواء بسرعة ≈ 340 م/ث.\n\nالضوء موجة كهرومغناطيسية عرضية تسير في الفراغ بسرعة:\nc = 3×10⁸ م/ث\n\nقانون سنيل للانكسار: n₁·sin(θ₁) = n₂·sin(θ₂)" },
  ],
  "كيمياء": [
    { title: "الجدول الدوري", text: "الجدول الدوري يُرتّب العناصر تصاعدياً حسب العدد الذري Z.\n\nالمجموعات (الأعمدة العمودية) تتشابه في خصائصها الكيميائية لأن لها نفس عدد إلكترونات التكافؤ.\n\nالدورات (الصفوف الأفقية) تمثل مستويات الطاقة.\n\nالمعادن تقع في يسار الجدول، واللافلزات في يمينه، وأشباه المعادن في المنتصف.\n\nإلكترونات التكافؤ (المستوى الخارجي) تحدد النشاط الكيميائي للعنصر." },
    { title: "الروابط الكيميائية", text: "الرابطة التساهمية:\nتنشأ بمشاركة الإلكترونات بين ذرتين. أمثلة: H₂، O₂، H₂O.\n\nالرابطة الأيونية:\nتنشأ بنقل إلكترون كامل من معدن إلى لافلز ليتكوّن أيونان (موجب وسالب). مثال: NaCl.\n\nالرابطة التناسقية:\nأحد الذرتين يمنح زوج الإلكترون كليهما.\n\nطاقة الرابطة تدل على قوتها وكمية الحرارة اللازمة لكسرها." },
    { title: "التفاعلات الكيميائية", text: "قانون حفظ المادة:\nمجموع كتل المتفاعلات = مجموع كتل المنتجات.\n\nأنواع التفاعلات:\n• التحليل: AB → A + B\n• الاتحاد: A + B → AB\n• الإحلال البسيط: A + BC → AC + B\n• الاحتراق: وقود + O₂ → CO₂ + H₂O\n\nعوامل تؤثر في سرعة التفاعل:\nالتركيز، درجة الحرارة، المساحة السطحية، المحفّز." },
    { title: "الأحماض والقواعد", text: "تعريف برونستد-لوري:\n• الحمض: مانح البروتون H⁺\n• القاعدة: مستقبل البروتون H⁺\n\nمقياس الحموضة:\npH = -log[H⁺]\n\n• pH < 7 : محلول حمضي\n• pH = 7 : محلول متعادل\n• pH > 7 : محلول قاعدي\n\nتفاعل التعادل:\nحمض + قاعدة → ملح + ماء\nمثال: HCl + NaOH → NaCl + H₂O" },
  ],
  "أحياء": [
    { title: "الخلية — وحدة الحياة", text: "الخلية هي الوحدة الوظيفية الأساسية لجميع الكائنات الحية.\n\nنوعان رئيسيان:\n• حقيقية النواة (Eukaryotes): تحتوي نواة محاطة بغشاء. أمثلة: خلايا الإنسان والنبات.\n• بدائية النواة (Prokaryotes): لا تحتوي نواة حقيقية. أمثلة: البكتيريا.\n\nمكونات الخلية الحيوانية:\nالغشاء الخلوي، السيتوبلازم، النواة (تحمل DNA)، الميتوكوندريا (إنتاج ATP)، الشبكة الإندوبلازمية، جهاز غولجي." },
    { title: "الوراثة والجينات", text: "الـ DNA يحمل المعلومات الوراثية ويتكون من سلسلتين ملتفتين على شكل حلزون مزدوج.\n\nقواعد النيتروجين وقاعدة التكامل:\n• A (أدينين) ↔ T (ثايمين)\n• G (غوانين) ↔ C (سيتوزين)\n\nالجين: قطعة من DNA تُشفّر بروتيناً معيناً.\n\nالكروموسومات تحمل الجينات. الإنسان لديه 46 كروموسوماً (23 زوجاً).\n\nالوراثة المندلية: الصفات السائدة والمتنحية وقوانين الوراثة الثلاثة." },
    { title: "البناء الضوئي والتنفس", text: "البناء الضوئي (في البلاستيدات الخضراء):\n6CO₂ + 6H₂O + ضوء → C₆H₁₂O₆ + 6O₂\n\nيتكون من مرحلتين:\n• مرحلة الضوء: تحويل الطاقة الضوئية إلى ATP و NADPH\n• دورة كالفن: ربت CO₂ وتكوين السكر\n\nالتنفس الخلوي الهوائي:\nC₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + 36-38 ATP\n\nالتنفس اللاهوائي: يُنتج أقل طاقة ويُنتج حمض اللاكتيك أو الإيثانول." },
    { title: "النظم البيئية والتطور", text: "النظام البيئي:\nمجموعة من الكائنات الحية وبيئتها الطبيعية تتفاعل فيما بينها.\n\nمكوناته:\n• المنتجون (النباتات): يصنعون الغذاء بالبناء الضوئي\n• المستهلكون: حيوانات تأكل النباتات أو بعضها\n• المحلّلون: بكتيريا وفطريات تحلل المواد الميتة\n\nنظرية التطور لداروين:\nالانتقاء الطبيعي — الكائنات الأكثر تكيفاً تنجو وتنقل صفاتها لذريتها." },
  ],
  "حاسب": [
    { title: "الخوارزميات والتعقيد", text: "الخوارزمية: سلسلة منطقية محددة من الخطوات لحل مسألة معينة.\n\nالتعقيد الزمني Big-O:\n• O(1) — ثابت: لا يتأثر بحجم المدخلات\n• O(log n) — لوغاريتمي: البحث الثنائي\n• O(n) — خطي: المرور على مصفوفة\n• O(n log n) — شبه خطي: الترتيب السريع\n• O(n²) — تربيعي: الترتيب الفقاعي\n\nخوارزميات الترتيب:\n• الفقاعي: O(n²) — بسيط لكن بطيء\n• السريع QuickSort: O(n log n) في المتوسط" },
    { title: "هياكل البيانات", text: "المصفوفة Array:\nوصول عشوائي O(1)، إدراج/حذف O(n)\n\nالقائمة المرتبطة LinkedList:\nإدراج في البداية O(1)، بحث O(n)\n\nالمكدس Stack — LIFO (آخر داخل أول خارج):\nعمليات push/pop/peek كلها O(1)\nاستخدامات: التراجع (Undo)، تقييم التعابير\n\nقائمة الانتظار Queue — FIFO (أول داخل أول خارج):\nenqueue/dequeue O(1)\n\nجدول التشتيت HashTable:\nبحث وإدراج O(1) في المتوسط" },
    { title: "قواعد البيانات", text: "قواعد البيانات العلائقية تُخزن البيانات في جداول مترابطة.\n\nأوامر SQL الأساسية:\n• SELECT — استرداد البيانات\n• INSERT — إضافة سجلات\n• UPDATE — تحديث البيانات\n• DELETE — حذف السجلات\n• JOIN — ربط جداول بعمود مشترك\n\nمفاهيم مهمة:\n• المفتاح الأساسي (Primary Key): مُعرّف فريد لكل سجل\n• المفتاح الأجنبي (Foreign Key): يربط جدولين\n• الفهرسة (Index): تسريع البحث" },
    { title: "الشبكات والإنترنت", text: "الشبكة: مجموعة أجهزة متصلة تتبادل البيانات.\n\nأنواع الشبكات:\n• LAN: شبكة محلية (مبنى، مكتب)\n• WAN: شبكة واسعة (الإنترنت)\n\nبروتوكولات أساسية:\n• TCP/IP: البروتوكول الأساسي للإنترنت\n• HTTP/HTTPS: نقل صفحات الويب\n• DNS: تحويل أسماء النطاقات إلى عناوين IP\n\nعنوان IP: مُعرّف رقمي لكل جهاز في الشبكة.\nIPv4: 32 بت — مثال: 192.168.1.1\nIPv6: 128 بت — للأجهزة المستقبلية" },
  ],
  "عربية": [
    { title: "النحو والإعراب", text: "الجملة الاسمية:\nتبدأ باسم وتتكون من مبتدأ (مرفوع) وخبر (مرفوع).\nمثال: المجتهدُ ناجحٌ\n\nالجملة الفعلية:\nتبدأ بفعل وتتكون من فعل وفاعل (مرفوع) ومفعول به (منصوب).\nمثال: كتبَ الطالبُ الدرسَ\n\nعلامات الإعراب الأصلية:\n• الضمة ← الرفع\n• الفتحة ← النصب\n• الكسرة ← الجر\n• السكون ← الجزم\n\nعلامات الإعراب الفرعية:\n• الألف في المثنى وجمع المذكر السالم (عند النصب والجر)\n• الواو في الأسماء الخمسة وجمع المذكر السالم (عند الرفع)" },
    { title: "البلاغة والأساليب", text: "التشبيه:\nإلحاق شيء بآخر في صفة مشتركة بأداة كـ، مثل، شبه.\nمثال: العلمُ كالنور\n\nالاستعارة:\nتشبيه حُذفت فيه أداة التشبيه والمشبه به.\nتصريحية (ذُكر المشبه به) أو مكنية (أُشير إليه بلازمه).\n\nالكناية:\nتعبير يُراد به لازم معناه لا معناه الحرفي.\nمثال: «هو كثير الرماد» كناية عن الكرم.\n\nالطباق: الجمع بين ضدّين في السياق نفسه.\nالمقابلة: مقابلة جملتين أو أكثر بما يناسبهما." },
    { title: "الصرف والاشتقاق", text: "الفعل الصحيح: خالٍ من حروف العلة (و، ي، أ).\nالفعل المعتل: يحتوي على حرف علة.\n\nأوزان الفعل الثلاثي المجرد:\n• فَعَلَ (فتح-فتح-فتح) مثل: كَتَبَ\n• فَعِلَ (فتح-كسر-فتح) مثل: فَرِحَ\n• فَعُلَ (فتح-ضم-فتح)  مثل: كَرُمَ\n\nالاشتقاق: أخذ كلمة جديدة من أخرى مع المشاركة في الجذر.\nأنواعه: الصغير (من نفس الجذر) والكبير (بقلب الحروف) والأكبر (بتبادل الحروف المتقاربة)." },
    { title: "الأدب والشعر العربي", text: "الشعر العربي القديم يُقاس بالأوزان (البحور الشعرية).\nأشهر البحور: الطويل، البسيط، الوافر، الكامل، الخفيف.\n\nعصور الأدب العربي:\n• الجاهلي: قبل الإسلام — المعلقات السبع\n• الإسلامي والأموي: توظيف الشعر في خدمة الدين والسياسة\n• العباسي: ازدهار الحضارة وتنوع الأغراض الشعرية\n• الحديث والمعاصر: الشعر الحر والقصيدة النثرية\n\nالرواية والقصة القصيرة تطوّرا في الأدب العربي الحديث مع نجيب محفوظ وغيره." },
  ],
};

/* ── progress store ─────────────────────────────────────────────────────────── */
const progressKey = (subject: string) => `buytuk_read_progress_${subject}`;
const getProgress  = (subject: string): number => parseInt(localStorage.getItem(progressKey(subject)) ?? "0", 10) || 0;
const setProgress  = (subject: string, idx: number) => localStorage.setItem(progressKey(subject), String(idx));

/* ═══════════════════════════════════════════════════════════════════════════ */

export function BookTextReader({ subject, subjectIcon, card }: Props) {
  const chapters = useFallbackChapters(subject);
  const [chIdx,  setChIdx]     = useState(() => getProgress(subject));
  const [fontSize, setFontSize] = useState(17);
  const [nightMode, setNight]   = useState(false);
  const [speaking,  setSpeaking] = useState<number | null>(null);
  const [showTOC,   setShowTOC]  = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  /* ── صوت المدرس المختار ─────────────────────────────────────────────── */
  const [activeVoiceId, setActiveVoiceId] = useState<string>(
    () => localStorage.getItem(ACTIVE_KEY) ?? VOICES[2].id,
  );
  const [voicePlaying, setVoicePlaying]   = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeVoice = VOICES.find(v => v.id === activeVoiceId) ?? VOICES[2];

  /* ── تهيئة مشغّل الصوت عند تغيير البصمة ─────────────────────────── */
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    const a = new Audio(activeVoice.file);
    a.preload = "auto";
    a.addEventListener("ended", () => setVoicePlaying(false));
    audioRef.current = a;
    setVoicePlaying(false);
    return () => { a.pause(); a.src = ""; };
  }, [activeVoiceId, activeVoice.file]);

  /* ── حفظ البصمة المختارة ──────────────────────────────────────────── */
  const selectVoice = (id: string) => {
    localStorage.setItem(ACTIVE_KEY, id);
    setActiveVoiceId(id);
  };

  /* ── Engine state (async books) ─────────────────────────────────────────── */
  const [engineBooks, setEngineBooks] = useState<import("../lib/offline-media-engine").BookMetadata[]>([]);
  const [engineChunks, setEngineChunks] = useState<TextChunk[]>([]);
  const [engineReady, setEngineReady]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await engine.init();
        if (cancelled) return;
        const all = await engine.getBookList();
        const matched = all.filter(b =>
          b.subject === subject ||
          b.subject.includes(subject.slice(0, 3)) ||
          subject.includes(b.subject.slice(0, 3)),
        );
        setEngineBooks(matched);
        if (matched[0]) {
          const cks = await engine.getBookChunks(matched[0].id);
          if (!cancelled) setEngineChunks(cks);
        }
      } catch { /* ignore — fall back to seed data */ }
      if (!cancelled) setEngineReady(true);
    })();
    return () => { cancelled = true; };
  }, [subject]);

  /* ── Save progress on chapter change ────────────────────────────────────── */
  useEffect(() => {
    setProgress(subject, chIdx);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [chIdx, subject]);

  /* ── Clamp chIdx when chapters change ───────────────────────────────────── */
  useEffect(() => {
    if (chIdx >= chapters.length) setChIdx(0);
  }, [chapters.length, chIdx]);

  const chapter = chapters[chIdx];
  if (!chapter) return null;

  /* ── Build paragraphs from chapter text ─────────────────────────────────── */
  const paragraphs = chapter.text.split("\n").filter(l => l.trim());

  /* ── Progress % ──────────────────────────────────────────────────────────── */
  const readPct = chapters.length > 1 ? Math.round((chIdx / (chapters.length - 1)) * 100) : 100;

  /* ── معامِلات TTS لكل مدرس ─────────────────────────────────────────────── */
  const VOICE_TTS_PARAMS: Record<string, { rate: number }> = {
    v_114:        { rate: 0.82 },  // المدرس الأول — هادئ متأنٍّ
    v_001:        { rate: 0.88 },  // المدرس الثاني — معتدل
    v_abdulbasit: { rate: 0.78 },  // المدرس الثالث — بطيء وواضح
  };

  /* ── TTS / قراءة الفقرة بصوت المدرس المختار ────────────────────────────── */
  const speakPara = (text: string, idx: number) => {
    // إيقاف أي تشغيل جارٍ
    engine.stopTTS();
    setSpeaking(idx);
    setVoicePlaying(true);
    const params = VOICE_TTS_PARAMS[activeVoiceId] ?? { rate: 0.88 };
    void engine.readAloud(text, {
      rate:  params.rate,
      onEnd: () => { setSpeaking(null); setVoicePlaying(false); },
    });
  };
  const stopSpeak = () => {
    engine.stopTTS();
    setSpeaking(null);
    setVoicePlaying(false);
  };

  /* ── Night mode bg/text ─────────────────────────────────────────────────── */
  const readerBg   = nightMode ? "#1a1a2e" : "#fffdf6";
  const readerText = nightMode ? "#e0d9c8" : "#1a1208";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── شريط اختيار صوت المدرس ─────────────────────────────────────── */}
      <div style={{ ...card, padding: "12px 18px", borderRadius: 14 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, fontWeight: 700 }}>
          🎙 اختر صوت المدرس لقراءة الدرس
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {VOICES.map(v => {
            const isActive = v.id === activeVoiceId;
            return (
              <button
                key={v.id}
                onClick={() => { stopSpeak(); selectVoice(v.id); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 16px", borderRadius: 22,
                  border: `2px solid ${isActive ? v.color : "var(--glass-border)"}`,
                  background: isActive ? `${v.color}1a` : "transparent",
                  color: isActive ? v.color : "var(--text-muted)",
                  fontWeight: isActive ? 800 : 500,
                  fontSize: 13, cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.2s",
                }}
              >
                <span style={{ fontSize: 18 }}>{v.icon}</span>
                <span>{v.name}</span>
                {isActive && voicePlaying && (
                  <span style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 14 }}>
                    {[1,2,1].map((h,i) => (
                      <span key={i} style={{
                        display: "inline-block", width: 3, height: h * 5,
                        background: v.color, borderRadius: 2,
                        animation: `wave-bar 0.5s ease-in-out ${i*0.15}s infinite alternate`,
                      }} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {voicePlaying && (
          <div style={{
            marginTop: 10, display: "flex", alignItems: "center", gap: 8,
            fontSize: 12, color: activeVoice.color,
          }}>
            <span>🔊</span>
            <span>يُشغِّل: <strong>{activeVoice.name}</strong></span>
            <button
              onClick={stopSpeak}
              style={{
                border: "none", background: "none",
                color: "var(--text-muted)", cursor: "pointer",
                fontSize: 13, padding: "0 4px",
              }}
            >
              ■ إيقاف
            </button>
          </div>
        )}
        <style>{`@keyframes wave-bar{from{transform:scaleY(1)}to{transform:scaleY(2.2)}}`}</style>
      </div>

      {/* ── Progress bar ───────────────────────────────────────────────────── */}
      <div style={{ ...card, padding: "12px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {subjectIcon} {subject} — الفصل {chIdx + 1} من {chapters.length}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Font controls */}
            <button onClick={() => setFontSize(s => Math.max(13, s - 1))}
              style={ctrlBtn}>أ-</button>
            <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 30, textAlign: "center" }}>{fontSize}px</span>
            <button onClick={() => setFontSize(s => Math.min(24, s + 1))}
              style={ctrlBtn}>أ+</button>
            {/* Night mode */}
            <button onClick={() => setNight(n => !n)}
              style={{ ...ctrlBtn, background: nightMode ? "#2a2a4a" : "var(--bg)", color: nightMode ? "#e0d9c8" : "var(--text)" }}>
              {nightMode ? "☀️" : "🌙"}
            </button>
            {/* TOC toggle */}
            <button onClick={() => setShowTOC(s => !s)} style={{ ...ctrlBtn, color: "var(--primary)", borderColor: "var(--primary)" }}>
              📑 الفهرس
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height: 6, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${readPct}%`, background: "linear-gradient(90deg,var(--primary),var(--secondary))", borderRadius: 4, transition: "width 0.5s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>البداية</span>
          <span style={{ fontSize: 11, color: "var(--primary)", fontWeight: 700 }}>{readPct}% مكتمل</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>النهاية</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: showTOC ? "220px 1fr" : "1fr", gap: 16, alignItems: "start" }}>

        {/* ── Table of Contents ──────────────────────────────────────────── */}
        {showTOC && (
          <div style={{ ...card, position: "sticky", top: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: "var(--primary)" }}>📑 فهرس الفصول</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {chapters.map((ch, i) => (
                <button key={i} onClick={() => { setChIdx(i); stopSpeak(); }}
                  style={{
                    textAlign: "right", padding: "9px 12px", borderRadius: 8, border: "none",
                    background: i === chIdx ? "rgba(108,99,255,0.12)" : "transparent",
                    color: i === chIdx ? "var(--primary)" : "var(--text)",
                    fontWeight: i === chIdx ? 800 : 500,
                    cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                    borderRight: i === chIdx ? "3px solid var(--primary)" : "3px solid transparent",
                    transition: "all 0.15s",
                  }}>
                  <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: 11 }}>{i + 1}.</span>
                  {ch.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Chapter content ────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Chapter header */}
          <div style={{ ...card, borderRight: "4px solid var(--primary)", paddingRight: 20 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, fontWeight: 600 }}>
              الفصل {chIdx + 1}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{chapter.title}</div>
          </div>

          {/* Reader area */}
          <div ref={contentRef} style={{
            ...card, padding: 28,
            background: readerBg,
            border: `1px solid ${nightMode ? "rgba(255,255,255,0.08)" : "var(--glass-border)"}`,
            minHeight: 400,
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {paragraphs.map((para, i) => {
                const isActive = speaking === i;
                const isHeading = para.startsWith("•") || /^[A-Za-zأ-ي\u0600-\u06FF].{0,40}:/.test(para) || para.length < 60;
                return (
                  <div key={i} style={{ position: "relative" }}>
                    <p style={{
                      margin: 0,
                      fontSize: isHeading ? fontSize - 1 : fontSize,
                      lineHeight: 2.1,
                      color: isActive ? "var(--primary)" : readerText,
                      fontWeight: para.startsWith("•") ? 600 : 400,
                      background: isActive ? (nightMode ? "rgba(108,99,255,0.15)" : "rgba(108,99,255,0.06)") : "transparent",
                      borderRadius: 8,
                      padding: isActive ? "8px 12px" : "2px 0",
                      transition: "all 0.3s",
                      cursor: "default",
                      direction: "rtl",
                      fontFamily: "'Amiri', 'Noto Naskh Arabic', 'Scheherazade New', 'Traditional Arabic', 'Arial', sans-serif",
                      whiteSpace: "pre-wrap",
                    }}>
                      {para}
                    </p>
                    {/* TTS button */}
                    <button
                      onClick={() => (speaking === i && voicePlaying) ? stopSpeak() : speakPara(para, i)}
                      title={isActive ? "إيقاف" : "استمع"}
                      style={{
                        position: "absolute", top: 4, left: -36,
                        width: 28, height: 28, borderRadius: "50%",
                        background: isActive ? "var(--primary)" : "transparent",
                        border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}`,
                        color: isActive ? "#fff" : "var(--text-muted)",
                        cursor: "pointer", fontSize: 12, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        opacity: 0.7, transition: "opacity 0.2s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
                    >
                      {isActive ? "■" : "▶"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Engine chunks (if extra content from IndexedDB) */}
          {engineReady && engineChunks.filter(c => c.chapterIndex === chIdx).length > 0 && (
            <div style={{ ...card, background: "rgba(108,99,255,0.03)", border: "1px dashed var(--primary)" }}>
              <div style={{ fontSize: 12, color: "var(--primary)", fontWeight: 700, marginBottom: 10 }}>
                🤖 محتوى ذكي إضافي من المحرك المحلي
              </div>
              {engineChunks.filter(c => c.chapterIndex === chIdx).map((chunk, i) => (
                <p key={chunk.id} style={{ fontSize: 14, lineHeight: 1.9, color: readerText, margin: "8px 0", direction: "rtl" }}>
                  {chunk.text}
                </p>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => { setChIdx(i => Math.max(0, i - 1)); stopSpeak(); }}
              disabled={chIdx === 0}
              style={{ padding: "10px 20px", background: chIdx === 0 ? "var(--bg)" : "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: chIdx === 0 ? "var(--text-muted)" : "var(--text)", cursor: chIdx === 0 ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
              → الفصل السابق
            </button>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
              {chapters.map((_, i) => (
                <button key={i} onClick={() => { setChIdx(i); stopSpeak(); }}
                  style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: i === chIdx ? "var(--primary)" : i < chIdx ? "rgba(108,99,255,0.3)" : "var(--bg)", color: i === chIdx ? "#fff" : "var(--text-muted)", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all 0.2s" }}>
                  {i + 1}
                </button>
              ))}
            </div>

            <button
              onClick={() => { setChIdx(i => Math.min(chapters.length - 1, i + 1)); stopSpeak(); }}
              disabled={chIdx === chapters.length - 1}
              style={{ padding: "10px 20px", background: chIdx === chapters.length - 1 ? "var(--bg)" : "linear-gradient(135deg,var(--primary),var(--secondary))", border: "none", borderRadius: "var(--radius-sm)", color: chIdx === chapters.length - 1 ? "var(--text-muted)" : "#fff", cursor: chIdx === chapters.length - 1 ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
              الفصل التالي ←
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Fallback chapters from seed data ───────────────────────────────────────── */
function useFallbackChapters(subject: string): { title: string; text: string }[] {
  const key = Object.keys(SUBJECT_CHAPTERS).find(k =>
    subject.includes(k) || k.includes(subject) ||
    subject.slice(0, 3) === k.slice(0, 3),
  );
  return key ? SUBJECT_CHAPTERS[key]! : [{
    title: subject,
    text: `محتوى ${subject} — سيُضيف المعلم فصول الكتاب قريباً.\n\nيمكنك في الوقت الحالي استخدام تبويب «الشرح» لمشاهدة ملف PDF أو تبويب «المذاكرة التفاعلية» للتدرب مع المساعد الذكي.`,
  }];
}

/* ── Shared button style ──────────────────────────────────────────────────── */
const ctrlBtn: React.CSSProperties = {
  padding: "5px 10px", background: "var(--bg)",
  border: "1px solid var(--border)", borderRadius: 6,
  cursor: "pointer", fontSize: 13, fontWeight: 700,
  fontFamily: "inherit", color: "var(--text)",
};
