import { createClient } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';
import { parseSupabaseConfig } from '@family-tree/core/config';
import type { Relationship } from '@family-tree/core/relationships';
import type { Gender } from '@family-tree/core/gender';
import { familyApi } from '@family-tree/core/api';
let stored: { url?: string; key?: string } = {};
try { stored = JSON.parse(localStorage.getItem('kinship.connection') || '{}'); } catch { /* An invalid saved setting opens connection setup. */ }
export let configError = '';
export const connection = (() => {
  try { return parseSupabaseConfig(import.meta.env.VITE_SUPABASE_URL || stored.url, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || stored.key); }
  catch (e) { configError = message(e); return { configured: false, url: '', key: '' }; }
})();
export const supabase = connection.configured ? createClient(connection.url, connection.key, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;
export const api = supabase ? familyApi(supabase) : null;
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 }, mutations: { retry: false } } });
export function message(e: unknown): string { return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e); }
export function db() { if (!supabase) throw new Error('Connect your Supabase project first.'); return supabase; }
export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(name, args); if (error) throw error; return data as T;
}
export async function refresh() { await queryClient.invalidateQueries(); }
export type Family = { id: string; name: string; admin_user_id: string; created_by: string; settings: Record<string, unknown>; enabled_features: Record<string, boolean>; allowed_features: Record<string, boolean>; suspended: boolean };
export type Person = { id: string; family_id: string; full_name: string; gender: Gender | null; father_id: string | null; mother_id: string | null; linked_user_id: string | null; custom_fields: Record<string, unknown>; version: number };
export type Role = 'admin' | 'moderator' | 'member';
export type PrivateProfile = { dob?: string | null; address?: string | null; street_address?: string | null; original_address?: string | null; phone?: string | null; email?: string | null; social_links?: Record<string,string>; map_url?: string | null; extra_fields?: Record<string,unknown> };
export const publicProfileFields = ['dob','address','street_address','original_address','phone','email','map_url'] as const;
export async function selectRows<T>(table: string, familyId?: string): Promise<T[]> {
  let q = db().from(table).select('*'); if (familyId) q = q.eq('family_id', familyId);
  const { data, error } = await q; if (error) throw error; return data as T[];
}

export async function listFamilyPeople(familyId: string): Promise<Person[]> {
  const people: Person[] = [];
  const pageSize = 500;
  let after: string | undefined;
  while (true) {
    let query = db().from('members').select('*').eq('family_id', familyId).order('id').limit(pageSize);
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw error;
    people.push(...data as Person[]);
    if (data.length < pageSize) return people;
    after = data.at(-1)!.id;
  }
}

export async function listFamilyRelationships(familyId: string): Promise<Relationship[]> {
  const relationships: Relationship[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db().from('member_relationships').select('source_id,target_id,kind')
      .eq('family_id', familyId).order('source_id').order('target_id').order('kind')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    relationships.push(...data as Relationship[]);
    if (data.length < pageSize) return relationships;
  }
}
