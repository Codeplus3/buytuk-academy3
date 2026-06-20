import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'YOUR_SUPABASE_URL'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_X1PHj0h8hqCos96g7xJTdA_DU-fKzlt'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
