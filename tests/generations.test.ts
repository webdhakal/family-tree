import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutMembers } from '../packages/core/src/layout';
import { indexFamily, searchFamily } from '../packages/core/src/generations';

test('matches a generation across branches and keeps the links to its ancestors', () => {
  const people = [
    {id:'d', full_name:'Robin', father_id:'c', mother_id:'b'},
    {id:'b', full_name:'Rowan', father_id:'a', mother_id:null},
    {id:'x', full_name:'Robin', father_id:'a', mother_id:null},
    {id:'a', full_name:'Alex', father_id:null, mother_id:null},
    {id:'c', full_name:'Casey', father_id:'x', mother_id:null},
  ];
  const family = indexFamily(people);
  assert.equal(family.generations.get('d'), 4);
  assert.deepEqual(searchFamily(family, '', 2).matches.map(p=>p.id), ['b','x']);
  const result = searchFamily(family, '  ROBIN  ');
  assert.deepEqual(result.matches.map(p=>p.id), ['d','x']);
  assert.equal(result.diagram.length, 5);
  assert.equal(searchFamily(family, 'Robin', 1).diagram.length, 0);
  const selected = searchFamily(family, '', [2, 4]);
  assert.deepEqual(selected.diagram.map(person => person.id), ['d','b','x']);
  assert.deepEqual(layoutMembers(selected.diagram).edges.map(edge => edge.id), ['b:d']);
  assert.deepEqual(searchFamily(family, 'Robin', [2, 4]).diagram.map(person => person.id), ['d','x']);
});

test('spouses share the later generation and adopted children follow it', () => {
  const people = [
    { id: 'root', full_name: 'Root', father_id: null, mother_id: null },
    { id: 'parent', full_name: 'Parent', father_id: 'root', mother_id: null },
    { id: 'spouse', full_name: 'Spouse', father_id: null, mother_id: null },
    { id: 'child', full_name: 'Child', father_id: null, mother_id: null },
  ];
  const links = [
    { source_id: 'parent', target_id: 'spouse', kind: 'spouse' },
    { source_id: 'spouse', target_id: 'child', kind: 'adopted_child' },
  ] as const;
  const indexed = indexFamily(people, [...links]);
  assert.equal(indexed.generations.get('parent'), 2);
  assert.equal(indexed.generations.get('spouse'), 2);
  assert.equal(indexed.generations.get('child'), 3);
  const graph = layoutMembers(people, [...links], indexed.generations);
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  assert.equal(byId.get('parent')!.y, byId.get('spouse')!.y);
  assert.ok(byId.get('child')!.y > byId.get('spouse')!.y);
  assert.deepEqual(searchFamily(indexed, 'Child').diagram.map(person => person.id), ['root', 'parent', 'spouse', 'child']);
});
