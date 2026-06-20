import type { ExamRecord } from "@/lib/db";

interface Props { records: ExamRecord[]; card: React.CSSProperties; }

export function PerformanceChart({ records, card }: Props) {
  if (records.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>📊</div>
        <p style={{ color: "var(--text-muted)" }}>لم تُكمل أي اختبار بعد — ابدأ أول اختبار لترى تقريرك هنا</p>
      </div>
    );
  }

  const sorted = [...records].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  const last10 = sorted.slice(-10);
  const avg    = Math.round(records.reduce((s, r) => s + r.percentage, 0) / records.length);
  const best   = Math.max(...records.map(r => r.percentage));
  const passed = records.filter(r => r.percentage >= 60).length;
  const passRate = Math.round((passed / records.length) * 100);

  const W = 560, H = 170, PAD = 36;
  const slotW = (W - PAD * 2) / last10.length;
  const barW  = Math.min(slotW - 6, 38);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {[
          { icon: "📝", label: "إجمالي الاختبارات", value: records.length, color: "var(--primary)" },
          { icon: "✅", label: "معدل النجاح",        value: `${passRate}%`,    color: "var(--success)" },
          { icon: "📊", label: "متوسط درجاتي",       value: `${avg}%`,         color: "var(--info)" },
          { icon: "🏆", label: "أفضل نتيجة",         value: `${best}%`,        color: "var(--warning)" },
        ].map(s => (
          <div key={s.label} style={{ ...card, textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: 26, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.color, marginBottom: 2 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ ...card, padding: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>📈 آخر {last10.length} اختبارات</h4>
        <svg viewBox={`0 0 ${W} ${H + 36}`} style={{ width: "100%", height: "auto", display: "block" }}>
          {[0, 25, 50, 75, 100].map(v => {
            const y = H - (v / 100) * (H - 16) + 8;
            return (
              <g key={v}>
                <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4,3" />
                <text x={PAD - 6} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-muted)">{v}</text>
              </g>
            );
          })}
          {last10.map((r, i) => {
            const bH  = Math.max(4, (r.percentage / 100) * (H - 16));
            const cx  = PAD + i * slotW + slotW / 2;
            const x   = cx - barW / 2;
            const y   = H - bH + 8;
            const clr = r.percentage >= 60 ? "#22c55e" : "#ef4444";
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={bH} rx={5} fill={clr} opacity="0.85" />
                <text x={cx} y={y - 4} textAnchor="middle" fontSize="9" fill={clr} fontWeight="700">{r.percentage}%</text>
                <text x={cx} y={H + 22} textAnchor="middle" fontSize="8" fill="var(--text-muted)"
                  transform={`rotate(-30,${cx},${H + 22})`}>{r.examTitle.slice(0, 7)}</text>
              </g>
            );
          })}
          {/* 60% line */}
          {(() => { const y = H - (60 / 100) * (H - 16) + 8; return (
            <g>
              <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6,3" />
              <text x={W - PAD + 4} y={y + 4} fontSize="9" fill="#f59e0b" fontWeight="700">60%</text>
            </g>
          ); })()}
        </svg>
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--glass-border)", fontWeight: 700, fontSize: 14 }}>
          📋 سجل جميع الاختبارات
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>#</th><th>الاختبار</th><th>الدرجة</th><th>النسبة</th><th>✅ صح</th><th>❌ خطأ</th><th>الحالة</th><th>التاريخ</th></tr></thead>
            <tbody>
              {[...records].reverse().map((r, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{records.length - i}</td>
                  <td style={{ fontWeight: 600 }}>{r.examTitle}</td>
                  <td><strong style={{ color: r.percentage >= 60 ? "var(--success)" : "var(--danger)" }}>{r.score}/{r.maxScore}</strong></td>
                  <td><span className={`badge ${r.percentage >= 60 ? "badge-success" : "badge-danger"}`}>{r.percentage}%</span></td>
                  <td style={{ color: "var(--success)", fontWeight: 700 }}>{r.correct}</td>
                  <td style={{ color: "var(--danger)", fontWeight: 700 }}>{r.wrong}</td>
                  <td><span className={`badge ${r.percentage >= 60 ? "badge-success" : "badge-danger"}`}>{r.percentage >= 60 ? "ناجح" : "راسب"}</span></td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.completedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

