import React from "react";

export interface DashboardWidgetProps {
  title: string;
  subtitle?: string;
  data?: Array<{ name: string; value: number }>;
  loading?: boolean;
  height?: number;
}

export function DashboardWidget({ title, subtitle, data = [], loading = false, height = 320 }: DashboardWidgetProps) {
  return (
    <section style={{ minHeight: height, padding: 20, background: "var(--card)", borderRadius: 20, boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)", border: "1px solid var(--glass-border)" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h3>
            {subtitle && <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>{subtitle}</p>}
          </div>
        </div>
      </header>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: height - 80, color: "var(--text-muted)" }}>
          جارٍ التحميل...
        </div>
      ) : (
        <div style={{ height: height - 80, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
          {/* TODO: استبدل المحتوى أدناه برسم بياني من Recharts */}
          <div style={{ textAlign: "center" }}>
            <p>الرسم البياني سيعرض هنا</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>أضف بيانات Supabase عبر hook مستقل</p>
          </div>
        </div>
      )}
    </section>
  );
}
