import dagre from '@dagrejs/dagre';
import type { TreeRecord } from './generations';
import type { Relationship, RelationshipKind } from './relationships';

export const NODE_WIDTH = 208, NODE_HEIGHT = 72;
type Edge = { id: string; source: string; target: string; kind: RelationshipKind | 'father' | 'mother' };

export function layoutMembers<T extends TreeRecord>(
  members: T[], relationships: Relationship[] = [], generations?: Map<string, number>,
) {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: 'TB', nodesep: 32, ranksep: 64 });
  graph.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(members.map(member => member.id));
  members.forEach(member => graph.setNode(member.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));

  const edges = new Map<string, Edge>();
  function add(source: string, target: string, kind: Edge['kind']) {
    if (!ids.has(source) || !ids.has(target)) return;
    const id = kind === 'spouse' ? `spouse:${source}:${target}` : `${source}:${target}`;
    // One edge per parent-child pair. Adoption stays visible when a child
    // is also listed as a son or daughter.
    if (!edges.has(id) || kind === 'adopted_child') edges.set(id, { id, source, target, kind });
  }
  for (const link of relationships) add(link.source_id, link.target_id, link.kind);
  for (const child of members) {
    if (child.father_id) add(child.father_id, child.id, 'father');
    if (child.mother_id) add(child.mother_id, child.id, 'mother');
  }
  const partners = new Map<string, string[]>();
  for (const { id, source, target, kind } of edges.values()) {
    if (kind !== 'spouse') graph.setEdge(source, target, {}, id);
    else {
      partners.set(source, [...(partners.get(source) ?? []), target]);
      partners.set(target, [...(partners.get(target) ?? []), source]);
    }
  }
  dagre.layout(graph);
  const nodes = members.map(member => {
    const point = graph.node(member.id);
    return { ...member, x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEIGHT / 2 };
  });

  if (!generations) {
    return { nodes, edges: [...edges.values()], width: graph.graph().width || 1, height: graph.graph().height || 1 };
  }

  // Dagre supplies horizontal ordering. Explicit rows keep spouses at the
  // same height even when their original ancestry had different depths.
  const rows = new Map<number, typeof nodes>();
  for (const node of nodes) {
    const level = generations.get(node.id) ?? 0;
    if (!rows.has(level)) rows.set(level, []);
    rows.get(level)!.push(node);
  }
  const width = Math.max(1, ...[...rows.values()].map(row => row.length)) * (NODE_WIDTH + 32) - 32;
  [...rows.keys()].sort((a, b) => a - b).forEach((level, rowIndex) => {
    const row = rows.get(level)!.sort((a, b) => a.x - b.x);
    const rowIds = new Map(row.map(node => [node.id, node]));
    const seen = new Set<string>();
    const order: typeof nodes = [];
    for (const node of row) {
      if (seen.has(node.id)) continue;
      const cluster = [node];
      seen.add(node.id);
      for (let i = 0; i < cluster.length; i++) {
        for (const id of partners.get(cluster[i].id) ?? []) {
          const partner = rowIds.get(id);
          if (!partner || seen.has(id)) continue;
          seen.add(id);
          cluster.push(partner);
        }
      }
      order.push(...cluster);
    }
    const start = (width - row.length * (NODE_WIDTH + 32) + 32) / 2;
    order.forEach((node, column) => {
      node.x = start + column * (NODE_WIDTH + 32);
      node.y = rowIndex * (NODE_HEIGHT + 64);
    });
  });
  const positions = new Map(nodes.map(node => [node.id, node.x]));
  return {
    nodes, width, height: Math.max(1, rows.size) * (NODE_HEIGHT + 64) - 64,
    edges: [...edges.values()].map(edge =>
      edge.kind === 'spouse' && positions.get(edge.source)! > positions.get(edge.target)!
        ? { ...edge, source: edge.target, target: edge.source } : edge,
    ),
  };
}
