export type TreeRecord = {
  id: string;
  full_name: string;
  father_id: string | null;
  mother_id: string | null;
};

export function indexFamily<T extends TreeRecord>(people: T[]) {
  const byId = new Map(people.map(person => [person.id, person]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const remaining = new Map<string, number>();
  const generations = new Map<string, number>();
  const queue: string[] = [];

  for (const person of people) {
    const knownParents = [...new Set([person.father_id, person.mother_id])].filter(
      (id): id is string => id !== null && byId.has(id),
    );
    parents.set(person.id, knownParents);
    remaining.set(person.id, knownParents.length);
    if (!knownParents.length) {
      queue.push(person.id);
      generations.set(person.id, 1);
    }
    for (const id of knownParents) {
      if (!children.has(id)) children.set(id, []);
      children.get(id)!.push(person.id);
    }
  }

  const depths = new Map<string, number>();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const child of children.get(id) ?? []) {
      depths.set(child, Math.max(depths.get(child) ?? 1, generations.get(id)! + 1));
      const count = remaining.get(child)! - 1;
      remaining.set(child, count);
      if (!count) {
        generations.set(child, depths.get(child)!);
        queue.push(child);
      }
    }
  }
  return { people, byId, parents, children, generations };
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

export function searchFamily<T extends TreeRecord>(family: ReturnType<typeof indexFamily<T>>, name: string, generation?: number) {
  const term = name.trim().normalize('NFC').toLocaleLowerCase();
  const matches = family.people.filter(person =>
    person.full_name.normalize('NFC').toLocaleLowerCase().includes(term) &&
    (generation === undefined || family.generations.get(person.id) === generation),
  );
  const ids = connectedIds(matches.map(person => person.id), family.parents);
  return { matches, diagram: family.people.filter(person => ids.has(person.id)) };
}

export function familyBranch<T extends TreeRecord>(family: ReturnType<typeof indexFamily<T>>, focus: string, direction: 'ancestors' | 'descendants', depth: number) {
  const ids = connectedIds([focus], direction === 'ancestors' ? family.parents : family.children, depth);
  return family.people.filter(person => ids.has(person.id));
}
