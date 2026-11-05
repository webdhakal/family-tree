import { createClient } from '@supabase/supabase-js';
import { familyApi } from '../shared/api';
const env = (import.meta as ImportMeta & { env: Record<string, string> }).env;
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
export const api = familyApi(supabase);
