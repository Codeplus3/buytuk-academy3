import type { ExamRecord, Student, Subject } from "../lib/db";

interface Props {
  record:  ExamRecord;
  student: Student;
  subject?: Subject;
  onClose: () => void;
}

export function CertificateModal({ record, student, subject, onClose }: Props) {
  const print = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>شهادة اجتياز — ${student.name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', Arial, sans-serif; background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .cert { width: 800px; padding: 60px; border: 12px double #6d28d9; position: relative; text-align: center; }
    .cert::before { content: ''; position: absolute; inset: 8px; border: 2px solid #a855f7; pointer-events: none; }
    .logo { font-size: 60px; margin-bottom: 10px; }
    .org { font-size: 18px; font-weight: 700; color: #6d28d9; margin-bottom: 30px; }
    .title { font-size: 36px; font-weight: 900; color: #1a1a2e; margin-bottom: 6px; }
    .subtitle { font-size: 16px; color: #666; margin-bottom: 40px; }
    .name { font-size: 42px; font-weight: 900; color: #6d28d9; border-bottom: 3px solid #6d28d9; display: inline-block; padding-bottom: 6px; margin-bottom: 30px; }
    .detail { font-size: 16px; color: #333; margin-bottom: 10px; line-height: 1.8; }
    .score { font-size: 48px; font-weight: 900; color: #22c55e; margin: 20px 0; }
    .date { font-size: 14px; color: #888; margin-top: 30px; }
    .seal { font-size: 50px; margin-top: 20px; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="cert">
    <div class="logo">🎓</div>
    <div class="org">BuyTuk Academy — منصة التعليم الذكية</div>
    <div class="title">شهادة اجتياز</div>
    <div class="subtitle">تُقرّ منصة BuyTuk Academy بأن الطالب/ة</div>
    <div class="name">${student.name}</div>
    <div class="detail">قد اجتاز/ت بنجاح اختبار</div>
    <div class="detail"><strong style="color:#1a1a2e; font-size:20px;">${record.examTitle}</strong></div>
    ${subject ? `<div class="detail">في مادة: <strong>${subject.icon} ${subject.name}</strong></div>` : ""}
    <div class="score">${record.percentage}%</div>
    <div class="detail">الدرجة: ${record.score} من ${record.maxScore}</div>
    <div class="date">تاريخ الاجتياز: ${record.completedAt}</div>
    <div class="seal">🏅</div>
    <div style="margin-top:10px;font-size:12px;color:#aaa;">هذه الشهادة صادرة إلكترونياً من منصة BuyTuk Academy</div>
  </div>
</body>
</html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
      <div style={{ background: "var(--card)", borderRadius: "var(--radius)", padding: 40, maxWidth: 500, width: "100%", textAlign: "center", border: "1px solid var(--glass-border)" }}>
        <div style={{ fontSize: 64, marginBottom: 10 }}>🏅</div>
        <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 6, color: "var(--success)" }}>مبروك! اجتزت الاختبار 🎉</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: 20, fontSize: 14 }}>حصلت على <strong style={{ color: "var(--success)", fontSize: 18 }}>{record.percentage}%</strong> في اختبار "{record.examTitle}"</p>

        <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "var(--radius-sm)", padding: "16px 20px", marginBottom: 24, textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>تفاصيل النتيجة</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { l: "الدرجة", v: `${record.score}/${record.maxScore}`, c: "var(--success)" },
              { l: "النسبة", v: `${record.percentage}%`, c: "var(--success)" },
              { l: "صحيح ✅", v: record.correct, c: "var(--success)" },
              { l: "خطأ ❌",  v: record.wrong,   c: "var(--danger)" },
            ].map(({ l, v, c }) => (
              <div key={l} style={{ fontSize: 13 }}>
                <span style={{ color: "var(--text-muted)" }}>{l}: </span>
                <strong style={{ color: c }}>{v}</strong>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={print}
            style={{ flex: 1, padding: "12px 0", background: "linear-gradient(135deg,var(--primary),var(--primary-dark))", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 15 }}>
            🖨️ طباعة الشهادة
          </button>
          <button onClick={onClose}
            style={{ padding: "12px 24px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", color: "var(--text)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 15 }}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
