import { useMemo } from 'react';
import { ScrollView, View, Text, Pressable } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { Member } from '../shared/api';
import { layoutMembers, NODE_WIDTH, NODE_HEIGHT } from '../shared/layout';
// Native SVG + native touch targets; React Flow is web-only.
export function FamilyTree({ members, focusId, onSelect }: { members: Member[]; focusId: string; onSelect: (id: string) => void }) {
  const layout = useMemo(() => layoutMembers(members), [members]);
  const byId = new Map(layout.nodes.map(n => [n.id, n]));
  if (!members.length) return <Text>No members in this view.</Text>;
  return <ScrollView horizontal><ScrollView nestedScrollEnabled>
    <View style={{ width: layout.width + 32, height: layout.height + 32 }}>
      <Svg width={layout.width} height={layout.height} style={{ position: 'absolute' }}>
        {layout.edges.map(e => {
          const parent = byId.get(e.source)!, child = byId.get(e.target)!;
          return <Line key={e.id} x1={parent.x + NODE_WIDTH / 2} y1={parent.y + NODE_HEIGHT}
            x2={child.x + NODE_WIDTH / 2} y2={child.y} stroke={e.kind === 'father' ? '#334155' : '#0f766e'} strokeWidth={2} />;
        })}
      </Svg>
      {layout.nodes.map(n => <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`View ${n.full_name}`}
        onPress={() => onSelect(n.id)} style={{ position: 'absolute', left: n.x, top: n.y,
          width: NODE_WIDTH, height: NODE_HEIGHT, padding: 12, backgroundColor: '#fff',
          borderWidth: n.id === focusId ? 2 : 1, borderColor: '#0f766e', borderRadius: 8 }}>
        <Text numberOfLines={2}>{n.full_name}</Text>{n.id === focusId && <Text>Focused person</Text>}
      </Pressable>)}
    </View>
  </ScrollView></ScrollView>;
}
