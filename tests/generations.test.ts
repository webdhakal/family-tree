import assert from 'node:assert/strict';
import { test } from 'node:test';
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
});
