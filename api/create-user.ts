import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase server environment variables' });
  }

  try {
    const { email, password, role, full_name } = req.body || {};
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'email, password and role are required' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    });

    if (error || !data?.user) {
      return res.status(500).json({ error: error?.message ?? 'Failed to create Supabase user' });
    }

    const profile = {
      id: data.user.id,
      email,
      full_name: full_name ?? null,
      role,
    };

    const { error: profileError } = await supabase.from('profiles').insert([profile]);

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    return res.status(200).json({ userId: data.user.id });
  } catch (error: any) {
    console.error('خطأ كارثي في create-user:', error);
    return res.status(500).json({ error: error?.message, details: error });
  }
}
