import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Member } from '../shared/api';
import { layoutMembers, NODE_WIDTH, NODE_HEIGHT } from '../shared/layout';
export function FamilyTree({ members, focusId, onSelect }: { members: Member[]; focusId: string; onSelect: (id: string) => void }) {
  const { nodes, edges } = useMemo(() => {
    const layout = layoutMembers(members);
    return {
      nodes: layout.nodes.map(m => ({ id: m.id, position: { x: m.x, y: m.y },
        data: { label: `${m.full_name}${m.id === focusId ? ' (Me / focused person)' : ''}` },
        sourcePosition: Position.Bottom, targetPosition: Position.Top,
        style: { width: NODE_WIDTH, height: NODE_HEIGHT, border: m.id === focusId ? '2px solid #0f766e' : '1px solid #64748b' },
      })),
      edges: layout.edges.map(e => ({ ...e, label: e.kind, type: 'smoothstep' })),
    };
  }, [members, focusId]);
  if (!members.length) return <p>No members in this view.</p>;
  return <section aria-label="Family ancestry" style={{ height: '75vh', minHeight: 400 }}>
    <ReactFlow key={focusId} nodes={nodes} edges={edges} fitView minZoom={0.1} maxZoom={2}
      nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => onSelect(node.id)}>
      <Background /><Controls /><MiniMap />
    </ReactFlow>
    <details><summary>Accessible family list</summary><ul>{members.map(m => <li key={m.id}>
      <button onClick={() => onSelect(m.id)}>{m.full_name}</button>
    </li>)}</ul></details>
  </section>;
}
