export const relationshipLabels = {
  spouse: 'Wives / spouses',
  son: 'Sons',
  daughter: 'Daughters',
  adopted_child: 'Adopted children',
} as const;

export type RelationshipKind = keyof typeof relationshipLabels;
export type Relationship = { source_id: string; target_id: string; kind: RelationshipKind };

export function relatedIds(relationships: Relationship[], personId: string, kind: RelationshipKind) {
  return relationships.flatMap(link => {
    if (link.kind !== kind) return [];
    if (link.source_id === personId) return [link.target_id];
    return kind === 'spouse' && link.target_id === personId ? [link.source_id] : [];
  });
}
