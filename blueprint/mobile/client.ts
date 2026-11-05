import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { familyApi } from '../shared/api';
export const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce', lock: processLock },
});
// Call exactly once from root useEffect; cleanup prevents duplicate development subscriptions.
export function watchAuthRefresh() {
  if (Platform.OS === 'web') return () => {};
  if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
  });
  return () => { subscription.remove(); supabase.auth.stopAutoRefresh(); };
}
export const api = familyApi(supabase);
