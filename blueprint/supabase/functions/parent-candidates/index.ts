// Optional thin HTTP facade; core clients can use the PostgreSQL RPC directly.
import { createClient } from 'npm:@supabase/supabase-js@2';
Deno.serve(async request => {
  const allowedOrigin = Deno.env.get('WEB_ORIGIN')!;
  const origin = request.headers.get('origin');
  const cors = { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
  const respond = (data: unknown, status: number) => new Response(JSON.stringify(data), { status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (origin && origin !== allowedOrigin) return respond({ error: 'Origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return respond({ error: 'POST required' }, 405);
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return respond({ error: 'Sign in required' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await client.auth.getUser(authorization.slice(7));
  if (authError || !user) return respond({ error: 'Invalid session' }, 401);
  try {
    const reader = request.body?.getReader();
    if (!reader) return respond({ error: 'JSON body required' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 4096) { await reader.cancel(); return respond({ error: 'Request too large' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof body.name !== 'string' || body.name.length > 160 || typeof body.familyId !== 'string' || typeof body.memberId !== 'string') {
      return respond({ error: 'Invalid request' }, 400);
    }
    const { data, error } = await client.rpc('parent_candidates', { p_family: body.familyId, p_member: body.memberId, p_name: body.name });
    if (error) return respond({ error: 'Candidates unavailable' }, 400);
    return respond({ candidates: data }, 200);
  } catch { return respond({ error: 'Invalid request' }, 400); }
});
