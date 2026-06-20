import { useState } from "react";
import {
  getSubjects, getPlans,
  getPremiumSubjects, isStudentSubscribed,
  getOrderRequests, submitOrderRequest,
} from "../lib/db";
import type { Student, SubscriptionPlan } from "../lib/db";
import { toast } from "./Toast";

interface Props {
  student: Student;
  card: React.CSSProperties;
  onGoToTickets?: () => void;
}

const PAYMENT_METHODS = [
  { id: "bank_transfer",    icon: "🏦", label: "تحويل بنكي" },
  { id: "vodafone_cash",    icon: "📱", label: "فودافون كاش" },
  { id: "whatsapp_receipt", icon: "💬", label: "إيصال واتساب" },
] as const;

const WHATSAPP_NUM = "01010389600";
const BANK_IBAN    = "SA00 0000 0000 0000 0000 0000"; // placeholder — admin updates in settings
const VF_NUMBER    = "01010389600";

type View = "store" | "checkout" | "myplan";

export function Storefront({ student, card, onGoToTickets }: Props) {
  const [view, setView]       = useState<View>("store");
  const [method, setMethod]   = useState<OrderRequest_paymentMethod>("whatsapp_receipt");
  const [note, setNote]       = useState("");
  const [selPlan, setSelPlan] = useState<SubscriptionPlan | null>(null);
  const [sending, setSending] = useState(false);

  const isSubscribed    = isStudentSubscribed(student);
  const premiumIds      = getPremiumSubjects();
  const allSubjects     = getSubjects().filter(s => s.status === "active");
  const premiumSubjects = allSubjects.filter(s => premiumIds.has(s.id));
  const freeSubjects    = allSubjects.filter(s => !premiumIds.has(s.id));
  const plans           = getPlans();

  /* Check if student already has a pending order */
  const pendingOrder = getOrderRequests().find(
    o => o.studentId === student.id && o.status === "pending"
  );

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--glass-bg)",
    color: "var(--text)", fontFamily: "inherit", fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };

  const sendOrder = async () => {
    setSending(true);
    const order = submitOrderRequest({
      studentId:    student.id,
      studentName:  student.name,
      studentEmail: student.email,
      paymentMethod: method,
      planId:       selPlan?.id,
      planName:     selPlan?.name,
      note:         note.trim() || undefined,
    });
    setSending(false);
    toast(`تم إرسال طلبك ${order.orderRef} ✅ — انتظر تأكيد المدير`, "success");
    setView("store");
    setNote("");
  };

  /* ── CHECKOUT VIEW ── */
  if (view === "checkout") {
    return (
      <div className="page-flip">
        <button onClick={() => setView("store")} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
          ← العودة للمتجر
        </button>

        <div style={{ ...card, padding: 28, maxWidth: 600, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🛒</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>طلب الاشتراك في المحتوى المميز</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              لا تحتاج لبطاقة بنكية — فقط حوّل المبلغ وأرسل الإيصال
            </p>
          </div>

          {/* Plan picker */}
          {plans.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>اختر خطة الاشتراك</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {plans.map(p => (
                  <button key={p.id} onClick={() => setSelPlan(p)} style={{
                    flex: "1 1 140px", padding: "14px 12px", borderRadius: 12, cursor: "pointer",
                    fontFamily: "inherit", textAlign: "center", transition: "all 0.2s",
                    background: selPlan?.id === p.id ? `${p.color}18` : "var(--bg)",
                    border: `2px solid ${selPlan?.id === p.id ? p.color : "var(--border)"}`,
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>💳</div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{p.name}</div>
                    <div style={{ color: p.color, fontWeight: 900, fontSize: 18, margin: "4px 0" }}>
                      {p.price} ر.س
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {p.durationDays} يوم
                    </div>
                  </button>
                ))}
                <button onClick={() => setSelPlan(null)} style={{
                  flex: "1 1 140px", padding: "14px 12px", borderRadius: 12, cursor: "pointer",
                  fontFamily: "inherit", textAlign: "center",
                  background: !selPlan ? "rgba(108,99,255,0.08)" : "var(--bg)",
                  border: `2px solid ${!selPlan ? "var(--primary)" : "var(--border)"}`,
                }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>📋</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>بدون خطة محددة</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>يحدّدها المدير</div>
                </button>
              </div>
            </div>
          )}

          {/* Payment method */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>طريقة الدفع</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {PAYMENT_METHODS.map(m => (
                <button key={m.id} onClick={() => setMethod(m.id)} style={{
                  flex: "1 1 120px", padding: "12px 10px", borderRadius: 10, cursor: "pointer",
                  fontFamily: "inherit", textAlign: "center", transition: "all 0.2s",
                  background: method === m.id ? "rgba(108,99,255,0.1)" : "var(--bg)",
                  border: `2px solid ${method === m.id ? "var(--primary)" : "var(--border)"}`,
                  color: method === m.id ? "var(--primary)" : "var(--text)",
                  fontWeight: method === m.id ? 700 : 400,
                }}>
                  <div style={{ fontSize: 24 }}>{m.icon}</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{m.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Payment instructions */}
          <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.2)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--success)" }}>
              📋 تعليمات الدفع
            </div>
            {method === "bank_transfer" && (
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>🏦 <strong>البنك:</strong> البنك الأهلي السعودي</div>
                <div>💳 <strong>الآيبان:</strong> <span style={{ fontFamily: "monospace", direction: "ltr", display: "inline-block" }}>{BANK_IBAN}</span></div>
                <div>👤 <strong>الاسم:</strong> BuyTuk Academy</div>
                <div style={{ marginTop: 6, color: "var(--text-muted)" }}>بعد التحويل، أرسل صورة الإيصال عبر واتساب أو مذكرة الدعم</div>
              </div>
            )}
            {method === "vodafone_cash" && (
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>📱 <strong>رقم فودافون كاش:</strong> <span style={{ fontFamily: "monospace" }}>{VF_NUMBER}</span></div>
                <div>👤 <strong>الاسم:</strong> BuyTuk Academy</div>
                <div style={{ marginTop: 6, color: "var(--text-muted)" }}>بعد الإرسال، احتفظ برقم العملية وأرسله معنا</div>
              </div>
            )}
            {method === "whatsapp_receipt" && (
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>💬 <strong>واتساب:</strong> <a href={`https://wa.me/2${WHATSAPP_NUM}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontFamily: "monospace" }}>{WHATSAPP_NUM}</a></div>
                <div style={{ marginTop: 6, color: "var(--text-muted)" }}>أرسل صورة إيصال الدفع مباشرةً على واتساب أو من خلال <button onClick={onGoToTickets} style={{ color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: 0 }}>مذكرة الدعم</button></div>
              </div>
            )}
          </div>

          {/* Note */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>
              ملاحظة (رقم عملية / وصف الإيصال — اختياري)
            </label>
            <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} placeholder="مثال: تم التحويل اليوم، رقم العملية 123456" value={note} onChange={e => setNote(e.target.value)} />
          </div>

          <button onClick={sendOrder} disabled={sending} style={{
            width: "100%", padding: "14px", borderRadius: 10,
            background: "linear-gradient(135deg, var(--primary), var(--secondary))",
            color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit",
            fontWeight: 800, fontSize: 16, opacity: sending ? 0.7 : 1,
          }}>
            {sending ? "جارٍ الإرسال..." : "📤 إرسال طلب الاشتراك"}
          </button>
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
            سيتم تفعيل اشتراكك خلال ساعات من التأكيد اليدوي بواسطة المدير
          </p>
        </div>
      </div>
    );
  }

  /* ── STORE VIEW ── */
  return (
    <div className="page-flip">
      {/* Header */}
      <div style={{ ...card, marginBottom: 24, padding: "20px 24px", background: "linear-gradient(135deg, rgba(108,99,255,0.12), rgba(160,132,255,0.08))", border: "1px solid rgba(108,99,255,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🏪 متجر BuyTuk Academy</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {isSubscribed
                ? `✅ أنت مشترك — تمتّع بوصول كامل للمحتوى المميز${student.expiryDate ? ` حتى ${new Date(student.expiryDate).toLocaleDateString("ar-EG")}` : ""}`
                : "🔒 اشترك للوصول إلى المحتوى المميز والمواد الحصرية"}
            </p>
          </div>
          {!isSubscribed && !pendingOrder && (
            <button onClick={() => setView("checkout")} style={{
              padding: "12px 24px", borderRadius: 10,
              background: "linear-gradient(135deg, var(--primary), var(--secondary))",
              color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit",
              fontWeight: 800, fontSize: 14, whiteSpace: "nowrap",
            }}>
              🛒 اشترك الآن
            </button>
          )}
          {pendingOrder && (
            <div style={{ padding: "10px 18px", borderRadius: 10, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>
              ⏳ طلبك {pendingOrder.orderRef} قيد المراجعة
            </div>
          )}
        </div>
      </div>

      {/* Premium subjects */}
      {premiumSubjects.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>⭐</span>
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>المحتوى المميز</h3>
            <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(108,99,255,0.12)", color: "var(--primary)", fontSize: 12, fontWeight: 700 }}>
              {premiumSubjects.length} مادة
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {premiumSubjects.map(s => (
              <div key={s.id} style={{
                ...card, padding: 20, position: "relative", overflow: "hidden",
                border: isSubscribed ? "1px solid rgba(108,99,255,0.3)" : "1px solid var(--glass-border)",
              }}>
                {/* Premium badge */}
                <div style={{ position: "absolute", top: 12, left: 12, padding: "3px 10px", borderRadius: 20, background: "linear-gradient(135deg,#f59e0b,#ef4444)", color: "#fff", fontSize: 11, fontWeight: 800 }}>
                  ⭐ مميز
                </div>

                <div style={{ textAlign: "center", marginBottom: 14, paddingTop: 8 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{s.description}</div>
                </div>

                {/* Content indicators */}
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
                  {s.videoFileId && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "rgba(0,200,150,0.1)", color: "var(--success)" }}>📹 فيديو</span>}
                  {s.curriculumFileId && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "rgba(108,99,255,0.1)", color: "var(--primary)" }}>📖 مذكرة</span>}
                  {s.videos && s.videos.length > 0 && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>🎬 {s.videos.length} درس</span>}
                </div>

                {isSubscribed ? (
                  <div style={{ textAlign: "center", color: "var(--success)", fontSize: 13, fontWeight: 700 }}>
                    ✅ متاح لك
                  </div>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>🔒</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>يتطلب اشتراكاً</div>
                    <button onClick={() => setView("checkout")} style={{
                      padding: "8px 20px", borderRadius: 8, background: "var(--primary)",
                      color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit",
                      fontWeight: 700, fontSize: 13,
                    }}>
                      اشترك الآن
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Free subjects */}
      {freeSubjects.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>🆓</span>
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>المحتوى المجاني</h3>
            <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(0,200,150,0.12)", color: "var(--success)", fontSize: 12, fontWeight: 700 }}>
              {freeSubjects.length} مادة
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {freeSubjects.map(s => (
              <div key={s.id} style={{ ...card, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{s.description}</div>
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(0,200,150,0.1)", color: "var(--success)", fontWeight: 700 }}>✅ مجاني</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {premiumSubjects.length === 0 && freeSubjects.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>لا توجد مواد بعد</div>
        </div>
      )}
    </div>
  );
}

/* Type alias to avoid import complexity */
type OrderRequest_paymentMethod = "bank_transfer" | "vodafone_cash" | "whatsapp_receipt";
