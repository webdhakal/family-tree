import type { Relationship } from './relationships';

export type TreeRecord = {
  id: string;
  full_name: string;
  father_id: string | null;
  mother_id: string | null;
};

export function indexFamily<T extends TreeRecord>(people: T[], relationships: Relationship[] = []) {
  const byId = new Map(people.map(person => [person.id, person]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  const groups = new Map(people.map(person => [person.id, person.id]));
  function groupOf(id: string) {
    let root = id;
    while (groups.get(root) !== root) root = groups.get(root)!;
    while (id !== root) {
      const next = groups.get(id)!;
      groups.set(id, root);
      id = next;
    }
    return root;
  }
  function add(map: Map<string, string[]>, from: string, to: string) {
    const links = map.get(from) ?? [];
    if (!links.includes(to)) links.push(to);
    map.set(from, links);
  }
  function addParent(parent: string | null, child: string) {
    if (!parent || !byId.has(parent) || !byId.has(child)) return;
    add(parents, child, parent);
    add(children, parent, child);
  }
  for (const person of people) {
    addParent(person.father_id, person.id);
    addParent(person.mother_id, person.id);
  }
  for (const link of relationships) {
    if (!byId.has(link.source_id) || !byId.has(link.target_id)) continue;
    if (link.kind === 'spouse') {
      add(spouses, link.source_id, link.target_id);
      add(spouses, link.target_id, link.source_id);
      groups.set(groupOf(link.source_id), groupOf(link.target_id));
    } else {
      addParent(link.source_id, link.target_id);
    }
  }

  const groupChildren = new Map<string, string[]>();
  const groupParents = new Map<string, string[]>();
  for (const [parent, ids] of children) {
    for (const child of ids) {
      const from = groupOf(parent);
      const to = groupOf(child);
      add(groupChildren, from, to);
      add(groupParents, to, from);
    }
  }
  const roots = [...new Set(people.map(person => groupOf(person.id)))];
  const remaining = new Map(roots.map(id => [id, groupParents.get(id)?.length ?? 0]));
  const queue = roots.filter(id => remaining.get(id) === 0);
  const ranks = new Map(queue.map(id => [id, 1]));
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const child of groupChildren.get(id) ?? []) {
      ranks.set(child, Math.max(ranks.get(child) ?? 1, ranks.get(id)! + 1));
      const count = remaining.get(child)! - 1;
      remaining.set(child, count);
      if (!count) queue.push(child);
    }
  }
  const generations = new Map<string, number>();
  for (const person of people) {
    const group = groupOf(person.id);
    if (remaining.get(group) === 0) generations.set(person.id, ranks.get(group)!);
  }
  return { people, byId, parents, children, spouses, generations };
}

function connectedIds(seeds: string[], links: Map<string, string[]>, depth = Infinity) {
  const seen = new Set(seeds);
  let level = seeds;
  for (let i = 0; level.length && i < depth; i++) {
    const next: string[] = [];
    for (const id of level) {
      for (const neighbor of links.get(id) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        next.push(neighbor);
      }
    }
    level = next;
  }
  return seen;
}

export function searchFamily<T extends TreeRecord>(family: ReturnType<typeof indexFamily<T>>, name: string, generation?: number | number[]) {
  const term = name.trim().normalize('NFC').toLocaleLowerCase();
  const levels = new Set(typeof generation === 'number' ? [generation] : generation);
  const matches = family.people.filter(person =>
    person.full_name.normalize('NFC').toLocaleLowerCase().includes(term) &&
    (!levels.size || levels.has(family.generations.get(person.id) ?? 0)),
  );
  if (levels.size) return { matches, diagram: matches };
  const ancestry = new Map(family.people.map(person =>
    [person.id, [...(family.parents.get(person.id) ?? []), ...(family.spouses.get(person.id) ?? [])]]));
  const ids = connectedIds(matches.map(person => person.id), ancestry);
  return { matches, diagram: family.people.filter(person => ids.has(person.id)) };
}

export function familyBranch<T extends TreeRecord>(family: ReturnType<typeof indexFamily<T>>, focus: string, direction: 'family' | 'ancestors' | 'descendants', depth: number) {
  const ids = direction === 'family'
    ? new Set([focus, ...(family.parents.get(focus) ?? []), ...(family.children.get(focus) ?? [])])
    : connectedIds([focus], direction === 'ancestors' ? family.parents : family.children, depth);
  const connected = connectedIds([...ids], family.spouses);
  return family.people.filter(person => connected.has(person.id));
}
