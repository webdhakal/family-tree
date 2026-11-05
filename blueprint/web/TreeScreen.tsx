import { useQuery } from '@tanstack/react-query';
import type { FamilyApi } from '../shared/api';
import { FamilyTree } from './FamilyTree';
export function TreeScreen({ api, familyId, focusId, onSelect, direction = 'ancestors' }: { api: FamilyApi; familyId: string; focusId: string; onSelect: (id: string) => void; direction?: 'ancestors' | 'descendants' }) {
  const query = useQuery({ queryKey: ['tree', familyId, focusId, direction, 4], queryFn: () => direction === 'ancestors' ? api.ancestors(familyId, focusId, 4) : api.descendants(familyId, focusId, 4) });
  if (query.isPending) return <p role="status">Loading tree…</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  return <FamilyTree members={query.data} focusId={focusId} onSelect={onSelect} />;
}
