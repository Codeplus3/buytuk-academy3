/**
 * ProgressReportPDF — طابع تقرير الأداء (HTML → طباعة)
 * يفتح نافذة طباعة بتقرير احترافي يعمل 100% بدون إنترنت
 */
import type { Student, Subject, ExamRecord, AttendanceRecord, HomeworkSubmission, Homework } from "@/lib/db";
import type { Badge } from "@/lib/db";

export function printProgressReport(
  student:   Student,
  records:   ExamRecord[],
  subjects:  Subject[],
  attRecs:   AttendanceRecord[],
  subs:      HomeworkSubmission[],
  allHW:     Homework[],
  badges:    Badge[],
  points:    number,
): void {
  const now  = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  const avg  = records.length ? Math.round(records.reduce((s, r) => s + r.percentage, 0) / records.length) : 0;
  const pass = records.filter(r => r.percentage >= 60).length;
  const present = attRecs.filter(r => r.status === "present").length;
  const doneCt  = subs.filter(s => s.grade !== undefined).length;

  const subjectRows = subjects
    .map(s => {
      const recs = records.filter(r => r.subjectId === s.id);
      if (!recs.length) return "";
      const subjAvg = Math.round(recs.reduce((a, r) => a + r.percentage, 0) / recs.length);
      const color   = subjAvg >= 80 ? "#00c896" : subjAvg >= 60 ? "#f59e0b" : "#ef4444";
      return `
        <tr>
          <td>${s.icon} ${s.name}</td>
          <td>${recs.length}</td>
          <td style="color:${color};font-weight:800">${subjAvg}%</td>
          <td>${recs.filter(r => r.percentage >= 60).length} / ${recs.length}</td>
        </tr>`;
    }).join("");

  const badgeList = badges.map(b => `<span class="badge-chip">${b.icon} ${b.name}</span>`).join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>تقرير أداء — ${student.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; background: #fff; color: #1a1a2e; font-size: 13px; direction: rtl; }
  .page { max-width: 800px; margin: 0 auto; padding: 32px 28px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #6c63ff; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { font-size: 26px; font-weight: 900; color: #6c63ff; }
  .logo span { font-size: 13px; display: block; color: #666; font-weight: 400; margin-top: 4px; }
  .meta { text-align: left; font-size: 12px; color: #666; }
  .student-card { background: linear-gradient(135deg,#6c63ff,#a78bfa); color: #fff; border-radius: 14px; padding: 20px 24px; margin-bottom: 24px; display: flex; align-items: center; gap: 20px; }
  .avatar { width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
  .student-info h2 { font-size: 20px; font-weight: 900; }
  .student-info p { font-size: 12px; opacity: 0.85; margin-top: 4px; }
  .stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
  .stat { background: #f8f7ff; border-radius: 10px; padding: 14px; text-align: center; border: 1px solid #e8e3ff; }
  .stat .val { font-size: 22px; font-weight: 900; color: #6c63ff; }
  .stat .lbl { font-size: 11px; color: #888; margin-top: 4px; }
  h3 { font-size: 15px; font-weight: 800; margin-bottom: 12px; padding-right: 10px; border-right: 3px solid #6c63ff; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #6c63ff; color: #fff; padding: 10px 14px; text-align: right; font-size: 12px; }
  td { padding: 9px 14px; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
  tr:nth-child(even) td { background: #fafafa; }
  .badge-chip { display: inline-block; padding: 4px 12px; background: #f0edff; border-radius: 20px; font-size: 11px; margin: 3px; border: 1px solid #d4cfff; color: #5b51d8; }
  .badges-wrap { margin-bottom: 24px; }
  .footer { border-top: 1px solid #eee; padding-top: 12px; font-size: 11px; color: #aaa; text-align: center; margin-top: 24px; }
  .section { margin-bottom: 24px; }
  .att-bar { height: 10px; background: #e8e3ff; border-radius: 5px; overflow: hidden; margin-top: 6px; }
  .att-fill { height: 100%; background: #00c896; border-radius: 5px; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="logo">🎓 BuyTuk Academy<span>منصة التعليم الذكي</span></div>
    <div class="meta">
      <div>تاريخ التقرير: ${now}</div>
      <div>العام الدراسي: 2025/2026</div>
    </div>
  </div>

  <div class="student-card">
    <div class="avatar">👨‍🎓</div>
    <div class="student-info">
      <h2>${student.name}</h2>
      <p>
        ${student.stage === "primary" ? "ابتدائي" : student.stage === "middle" ? "متوسط" : "ثانوي"} ·
        الصف ${student.grade} ·
        ${student.track === "science" ? "علمي" : student.track === "arts" ? "أدبي" : "عام"}
      </p>
      <p style="margin-top:4px;opacity:0.75">${student.email} · ${student.schoolName}</p>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat"><div class="val">${avg}%</div><div class="lbl">المتوسط العام</div></div>
    <div class="stat"><div class="val">${pass}/${records.length}</div><div class="lbl">النجاح / الاختبارات</div></div>
    <div class="stat"><div class="val">${doneCt}/${allHW.length}</div><div class="lbl">الواجبات المنجزة</div></div>
    <div class="stat"><div class="val">${points}</div><div class="lbl">النقاط المكتسبة</div></div>
  </div>

  <div class="section">
    <h3>📊 الأداء حسب المادة</h3>
    ${subjectRows ? `<table><thead><tr><th>المادة</th><th>عدد الاختبارات</th><th>المتوسط</th><th>النجاح</th></tr></thead><tbody>${subjectRows}</tbody></table>` : "<p style='color:#aaa;text-align:center;padding:20px 0'>لا توجد بيانات</p>"}
  </div>

  <div class="section">
    <h3>🗓 الحضور والغياب</h3>
    <div style="display:flex;gap:20px;margin-bottom:8px">
      <span>✅ حاضر: <strong>${present}</strong></span>
      <span>❌ غائب: <strong>${attRecs.filter(r => r.status === "absent").length}</strong></span>
      <span>⏰ متأخر: <strong>${attRecs.filter(r => r.status === "late").length}</strong></span>
      <span>المجموع: <strong>${attRecs.length}</strong></span>
    </div>
    <div class="att-bar"><div class="att-fill" style="width:${attRecs.length ? Math.round(present / attRecs.length * 100) : 0}%"></div></div>
  </div>

  ${badges.length > 0 ? `
  <div class="section badges-wrap">
    <h3>🏅 الشارات المكتسبة</h3>
    <div>${badgeList}</div>
  </div>` : ""}

  <div class="footer">
    هذا التقرير مولَّد تلقائياً من منصة BuyTuk Academy — جميع البيانات محفوظة على الجهاز
  </div>
</div>
<script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

/* ── Button component ── */
interface Props {
  student:  Student;
  records:  ExamRecord[];
  subjects: Subject[];
  attRecs:  AttendanceRecord[];
  subs:     HomeworkSubmission[];
  allHW:    Homework[];
  badges:   Badge[];
  points:   number;
  style?:   React.CSSProperties;
}
export function ProgressReportButton({ student, records, subjects, attRecs, subs, allHW, badges, points, style }: Props) {
  return (
    <button
      onClick={() => printProgressReport(student, records, subjects, attRecs, subs, allHW, badges, points)}
      style={{
        padding: "10px 20px", background: "linear-gradient(135deg,var(--primary),var(--secondary))",
        border: "none", borderRadius: 12, color: "#fff", fontWeight: 800, fontSize: 13,
        cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
        ...style,
      }}
    >
      📄 طباعة تقرير الأداء PDF
    </button>
  );
}

