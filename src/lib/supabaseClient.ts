import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ خطأ: مفاتيح Supabase غير موجودة! تأكد من إعدادات Vercel.")
} else {
  console.log("✅ تم تحميل مفاتيح Supabase بنجاح")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
