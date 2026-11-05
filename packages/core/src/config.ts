export type Connection = { configured: boolean; url: string; key: string };
export function parseSupabaseConfig(url: string = '', key: string = ''): Connection {
  url = url.trim(); key = key.trim();
  if (!url || !key) return { configured: false, url: '', key: '' };
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new Error('Use the HTTPS Supabase project URL.');
  let role = '';
  if (key.startsWith('eyJ')) {
    try { role = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch { throw new Error('Invalid public API key.'); }
  }
  if (key.startsWith('sb_secret_') || role === 'service_role') throw new Error('Use a public publishable key, never a secret or service-role key.');
  if (!key.startsWith('sb_publishable_') && role !== 'anon') throw new Error('Use the project publishable key or legacy public anon key.');
  return { configured: true, url: parsed.origin, key };
}
