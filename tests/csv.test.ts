import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFamilyCsv } from '../packages/core/src/csv';
test('exact CSV mapping preserves contact text and keeps new columns private',async()=>{
 const rows=parseFamilyCsv(await readFile('blueprint/examples/family.csv','utf8'));
 assert.equal(rows.length,3);assert.equal(rows[0].father_record_id,'father');assert.equal(rows[0].profile.phone,'+9779800000000');assert.equal(rows[0].profile.extra_fields.Gotra,'Example');assert.deepEqual(rows[0].custom_fields,{});
});
test('CSV rejects invalid dates, unsafe links and duplicate source identities',()=>{
 assert.throws(()=>parseFamilyCsv('Full Name,DOB\nA,2023-02-29'));
 assert.throws(()=>parseFamilyCsv('Full Name,Map URL\nA,javascript:alert(1)'));
 assert.throws(()=>parseFamilyCsv('Full Name,Record ID\nA,x\nB,x'));
});
