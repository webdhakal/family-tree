import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportRow } from './csv';
export type Member = { id: string; family_id?: string; full_name: string; father_id: string | null; mother_id: string | null; version: number; generation?: number };
export type Candidate = Pick<Member, 'id' | 'full_name' | 'father_id' | 'mother_id'>;
export function familyApi(client: SupabaseClient) {
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data as T;
  }
  return {
    ancestors: (family: string, member: string, depth = 4) => rpc<Member[]>('ancestor_window', { p_family: family, p_member: member, p_depth: depth }),
    descendants: (family: string, member: string, depth = 3) => rpc<Member[]>('descendant_window', { p_family: family, p_member: member, p_depth: depth }),
    candidates: (family: string, member: string, name: string) => rpc<Candidate[]>('parent_candidates', { p_family: family, p_member: member, p_name: name }),
    proposeParent: (family: string, member: Member, parent: string, kind: 'father' | 'mother', key: string) => rpc<string>('submit_change', {
      p_family: family, p_member: member.id, p_kind: 'link', p_patch: { [`${kind}_id`]: parent }, p_version: member.version, p_key: key,
    }),
    claim: (family: string, member: Member, key: string) => rpc<string>('submit_change', {
      p_family: family, p_member: member.id, p_kind: 'claim', p_patch: {}, p_version: member.version, p_key: key,
    }),
    review: (change: string, approve: boolean, note = '') => rpc<string>('review_change', { p_change: change, p_approve: approve, p_note: note }),
    stageImport: (family: string, rows: ImportRow[], key: string) => rpc<string>('stage_import', { p_family: family, p_rows: rows, p_key: key }),
    approveImport: (batch: string, approve: boolean) => rpc<{ created: number; unresolved: number; ids: Record<string, string> }>('review_import', { p_batch: batch, p_approve: approve }),
  };
}
export type FamilyApi = ReturnType<typeof familyApi>;
