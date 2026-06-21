import { useState } from "react";
import { avatarUrl } from "@/lib/auth";
import {
  getOrderRequests, saveOrderRequests,
  getStudents, saveStudents,
  renewStudentSubscription, getPlans,
} from "@/lib/db";
import type { OrderRequest } from "@/lib/db";
import { toast } from "./Toast";

interface Props {
  adminEmail: string;
  card: React.CSSProperties;
}

type Filter = "all" | "pending" | "approved" | "rejected";

const STATUS_LABEL: Record<OrderRequest["status"], string> = {
  pending:  "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
};
const STATUS_COLOR: Record<OrderRequest["status"], string> = {
  pending:  "#f59e0b",
  approved: "var(--success)",
  rejected: "var(--danger)",
};
const METHOD_LABEL: Record<string, string> = {
  bank_transfer:    "🏦 تحويل بنكي",
  vodafone_cash:    "📱 فودافون كاش",
  whatsapp_receipt: "💬 إيصال واتساب",
};

export function OrdersAdminPanel({ adminEmail, card }: Props) {
  const [filter, setFilter]       = useState<Filter>("pending");
  const [rejectId, setRejectId]   = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selPlanId, setSelPlanId] = useState<Record<number, string>>({});

  const orders  = getOrderRequests();
  const plans   = getPlans();

  const filtered = orders
    .filter(o => filter === "all" || o.status === filter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pending  = orders.filter(o => o.status === "pending").length;
  const approved = orders.filter(o => o.status === "approved").length;
  const rejected = orders.filter(o => o.status === "rejected").length;

  const approveOrder = (order: OrderRequest) => {
    const planId = selPlanId[order.id] || order.planId;
    const plan   = plans.find(p => p.id === planId) ?? plans[0];

    /* Activate subscription */
    if (plan) {
      renewStudentSubscription(order.studentId, plan);
    } else {
      /* No plan — set active with 365 days default */
      const students = getStudents().map(s =>
        s.id === order.studentId
          ? { ...s, subscriptionStatus: "active" as const, expiryDate: new Date(Date.now() + 365 * 86400000).toISOString() }
          : s
      );
      saveStudents(students);
    }

    const updated = getOrderRequests().map(o =>
      o.id === order.id
        ? { ...o, status: "approved" as const, reviewedAt: new Date().toISOString(), reviewedBy: adminEmail, planId: planId || o.planId, planName: plan?.name || o.planName }
        : o
    );
    saveOrderRequests(updated);
    window.dispatchEvent(new CustomEvent("buytuk:students-changed"));
    toast(`✅ تم قبول طلب ${order.orderRef} وتفعيل اشتراك ${order.studentName}`, "success");
  };

  const rejectOrder = (order: OrderRequest) => {
    const updated = getOrderRequests().map(o =>
      o.id === order.id
        ? { ...o, status: "rejected" as const, reviewedAt: new Date().toISOString(), reviewedBy: adminEmail, rejectReason: rejectReason.trim() || "لم يتم التحقق من الدفع" }
        : o
    );
    saveOrderRequests(updated);
    setRejectId(null);
    setRejectReason("");
    toast(`❌ تم رفض طلب ${order.orderRef}`, "info");
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--glass-bg)",
    color: "var(--text)", fontFamily: "inherit", fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>🛒 طلبات الاشتراك</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        راجع طلبات الطلاب يدوياً بعد التحقق من الدفع عبر التحويل البنكي أو فودافون كاش
      </p>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
        {[
          { icon: "⏳", label: "قيد المراجعة", value: pending,  color: "#f59e0b" },
          { icon: "✅", label: "مقبولة",        value: approved, color: "var(--success)" },
          { icon: "❌", label: "مرفوضة",        value: rejected, color: "var(--danger)" },
          { icon: "📋", label: "إجمالي",        value: orders.length, color: "var(--primary)" },
        ].map(k => (
          <div key={k.label} style={{ ...card, textAlign: "center", padding: "18px 12px" }}>
            <div style={{ fontSize: 26, marginBottom: 4 }}>{k.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ ...card, display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, padding: "12px 16px" }}>
        {(["pending", "approved", "rejected", "all"] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 13, fontWeight: 700, transition: "all 0.2s",
            background: filter === f ? "var(--primary)" : "var(--bg)",
            color: filter === f ? "#fff" : "var(--text-muted)",
          }}>
            {f === "all" ? "الكل" : STATUS_LABEL[f as OrderRequest["status"]]}
            <span style={{ marginRight: 6, fontSize: 11, opacity: 0.8 }}>
              ({f === "all" ? orders.length : orders.filter(o => o.status === f).length})
            </span>
          </button>
        ))}
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>لا توجد طلبات</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filtered.map(o => (
            <div key={o.id} style={{ ...card, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <img src={avatarUrl(o.studentName)} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 15 }}>{o.studentName}</strong>
                      <span style={{ fontFamily: "monospace", fontSize: 12, background: "rgba(108,99,255,0.1)", color: "var(--primary)", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{o.orderRef}</span>
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${STATUS_COLOR[o.status]}20`, color: STATUS_COLOR[o.status] }}>
                        {STATUS_LABEL[o.status]}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{o.studentEmail}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "left" }}>
                  {new Date(o.createdAt).toLocaleString("ar-EG")}
                </div>
              </div>

              {/* Details */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: o.status === "pending" ? 16 : 0, padding: "12px 16px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}>
                <div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>طريقة الدفع</div><div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>الخطة المطلوبة</div><div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{o.planName ?? "غير محددة"}</div></div>
                {o.note && <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>ملاحظة الطالب</div><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2, color: "var(--primary)" }}>"{o.note}"</div></div>}
                {o.rejectReason && <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, color: "var(--text-muted)" }}>سبب الرفض</div><div style={{ fontWeight: 600, fontSize: 13, marginTop: 2, color: "var(--danger)" }}>{o.rejectReason}</div></div>}
                {o.reviewedBy && <div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>راجعه</div><div style={{ fontWeight: 600, fontSize: 12, marginTop: 2 }}>{o.reviewedBy}</div></div>}
              </div>

              {/* Actions — only for pending */}
              {o.status === "pending" && rejectId !== o.id && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {/* Plan override */}
                  {plans.length > 0 && (
                    <select style={{ ...inp, width: "auto", padding: "8px 12px" }} value={selPlanId[o.id] ?? o.planId ?? ""} onChange={e => setSelPlanId(prev => ({ ...prev, [o.id]: e.target.value }))}>
                      <option value="">— اختر خطة (اختياري) —</option>
                      {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.durationDays}د)</option>)}
                    </select>
                  )}
                  <button onClick={() => approveOrder(o)} style={{ padding: "9px 22px", borderRadius: 8, background: "var(--success)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 14 }}>
                    ✅ قبول وتفعيل
                  </button>
                  <button onClick={() => setRejectId(o.id)} style={{ padding: "9px 22px", borderRadius: 8, background: "rgba(255,71,87,0.1)", color: "var(--danger)", border: "1px solid var(--danger)", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 14 }}>
                    ❌ رفض
                  </button>
                </div>
              )}

              {/* Reject form */}
              {o.status === "pending" && rejectId === o.id && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input style={{ ...inp, flex: 1, minWidth: 200 }} placeholder="سبب الرفض (اختياري)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                  <button onClick={() => rejectOrder(o)} style={{ padding: "9px 18px", borderRadius: 8, background: "var(--danger)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                    تأكيد الرفض
                  </button>
                  <button onClick={() => setRejectId(null)} style={{ padding: "9px 14px", borderRadius: 8, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit" }}>
                    إلغاء
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

