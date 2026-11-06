import dagre from '@dagrejs/dagre';
import type { TreeRecord } from './generations';
export const NODE_WIDTH = 208, NODE_HEIGHT = 72;
export function layoutMembers<T extends TreeRecord>(members: T[]) {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: 'TB', nodesep: 32, ranksep: 64 });
  graph.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(members.map(m => m.id));
  members.forEach(m => graph.setNode(m.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  const edges: { id: string; source: string; target: string; kind: 'father' | 'mother' }[] = [];
  for (const child of members) {
    for (const kind of ['father', 'mother'] as const) {
      const parent = child[`${kind}_id`];
      if (parent && ids.has(parent)) {
        const id = `${parent}:${child.id}:${kind}`;
        graph.setEdge(parent, child.id, {}, id);
        edges.push({ id, source: parent, target: child.id, kind });
      }
    }
  }
  dagre.layout(graph);
  return {
    nodes: members.map(m => {
      const p = graph.node(m.id);
      return { ...m, x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 };
    }), edges, width: graph.graph().width || 1, height: graph.graph().height || 1,
  };
}
