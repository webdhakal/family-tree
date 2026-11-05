import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FamilyApi, Member } from './api';
export type ParentConflictProps = {
  api: FamilyApi; familyId: string; member: Member; name: string; kind: 'father' | 'mother';
  newKey: () => string;
};
// Mount the containing picker with key=familyId/member.id/member.version/name/kind.
export function useParentConflict({ api, familyId, member, name, kind, newKey }: ParentConflictProps) {
  const [selected, setSelected] = useState<string>('');
  const key = useRef<string | null>(null);
  const cache = useQueryClient();
  const candidates = useQuery({
    queryKey: ['parent-candidates', familyId, member.id, name],
    queryFn: () => api.candidates(familyId, member.id, name), enabled: Boolean(name.trim()), staleTime: 30_000,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!candidates.data?.some(c => c.id === selected)) throw new Error('Choose a listed candidate');
      key.current ||= newKey(); // Retry the same request after network timeouts.
      return api.proposeParent(familyId, member, selected, kind, key.current);
    },
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ['pending', familyId] }); },
  });
  function select(id: string) {
    if (id !== selected) { key.current = null; mutation.reset(); }
    setSelected(id);
  }
  return { selected, select, candidates, mutation };
}
