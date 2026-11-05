// @ts-nocheck
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const root=process.cwd();
test('tenant, approval, graph, import, identity and Storage security', async () => {
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;
`);
for(const file of ['202611050001_schema.sql','202611050002_imports_storage.sql','202611050003_app.sql']) await db.exec(await readFile(`${root}/supabase/migrations/${file}`,'utf8'));
const users={admin:'10000000-0000-4000-8000-000000000001', member:'10000000-0000-4000-8000-000000000002', other:'10000000-0000-4000-8000-000000000003',mod:'10000000-0000-4000-8000-000000000004'};
for(const [name,id] of Object.entries(users)) await db.query(`insert into auth.users values($1,$2,now())`,[id,`${name}@example.test`]);
async function actor(name){ await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[users[name]]); await db.exec('set role authenticated'); }
async function rpc(name,args){let n=0; return (await db.query(`select public.${name}(${args.map(()=>'$'+(++n)).join(',')}) as value`,args)).rows[0].value;}
async function denied(fn,label){let failed=false;try{await fn();}catch(e){failed=true;}assert(failed,label);}
await actor('admin'); const family=await rpc('create_family',['Examples']);
await denied(()=>rpc('create_family',['Second']), 'creator limited to one tree');
await actor('other');const otherFamily=await rpc('create_family',['Other']);
assert.equal((await db.query('select * from public.families')).rows.length,1);
await denied(()=>rpc('configure_family',[family,'stolen',{},{}]),'cross tenant config');
await actor('admin');
for(const name of ['member','mod']) {
 const token=await rpc('create_invitation',[family,`${name}@example.test`]);
 await actor(name);assert.equal(await rpc('accept_invitation',[token]),family);
 await denied(()=>rpc('accept_invitation',[token]),'invitation reuse denied');await actor('admin');
}
await rpc('set_role',[family,users.mod,'moderator']);
const payload=[{record_id:'child',full_name:'Asha Example',father_name:'Ram Example',mother_record_id:'mom',profile:{phone:'+977000',social_links:{},extra_fields:{}}},
 {record_id:'dad1',full_name:'Ram Example'}, {record_id:'dad2',full_name:'Ram Example'}, {record_id:'mom',full_name:'Maya Example'}];
const key='20000000-0000-4000-8000-000000000001';
const batch=await rpc('stage_import',[family,JSON.stringify(payload),key]);
assert.equal((await db.query('select * from public.members')).rows.length,0,'staged rows stay out of tree');
assert.equal(await rpc('stage_import',[family,JSON.stringify(payload),key]),batch);
const report=await rpc('review_import',[batch,true]); assert.equal(report.created,4); assert.equal(report.unresolved,1);
assert.deepEqual(await rpc('review_import',[batch,true]),report);
const child=report.ids.child, dad=report.ids.dad1, mom=report.ids.mom;
const getMember=async id=>(await db.query('select * from public.members where id=$1',[id])).rows[0];
assert.equal((await getMember(child)).mother_id,mom);assert.equal((await getMember(child)).father_id,null);
await actor('member');
assert.equal((await db.query('select * from public.member_private')).rows.length,0,'private profile hidden before claim');
assert.equal((await db.query('select * from public.members')).rows.length,4);
assert.equal((await db.query('select * from public.members where family_id=$1',[otherFamily])).rows.length,0);
await denied(()=>db.query(`update public.members set full_name='Tampered' where id=$1`,[child]),'direct writes denied');
await denied(()=>db.query(`insert into public.user_roles values($1,$2,'moderator')`,[family,users.other]),'role self assignment denied');
await denied(()=>rpc('review_import',[batch,true]),'member import approve denied');
await denied(()=>rpc('parent_candidates',[otherFamily,child,'Ram Example']),'cross tenant candidate denied');
const candidates=await db.query('select * from public.parent_candidates($1,$2,$3)',[family,child,'Ram Example']);assert.equal(candidates.rows.length,2);
const node=await getMember(child);
const change=await rpc('submit_change',[family,child,'link',JSON.stringify({father_id:dad}),node.version,key]);
assert.equal((await getMember(child)).father_id,null,'proposal cannot apply before review');
await denied(()=>rpc('review_change',[change,true,'']), 'member cannot approve');
await actor('mod');await rpc('review_change',[change,true,'Verified']);
assert.equal((await getMember(child)).father_id,dad);
assert.equal((await db.query('select * from public.import_issues where resolved_at is null')).rows.length,0);
const own=await rpc('submit_change',[family,dad,'edit',JSON.stringify({full_name:'Ram Example'}),(await getMember(dad)).version,key]);
await denied(()=>rpc('review_change',[own,true,'']), 'moderator self-review denied');
await actor('admin');await rpc('review_change',[own,true,'']);
const cycle=await rpc('submit_change',[family,dad,'link',JSON.stringify({father_id:child}),(await getMember(dad)).version,'20000000-0000-4000-8000-000000000002']);
await denied(()=>rpc('review_change',[cycle,true,'']), 'cycle rejected');
const ancestor=await db.query('select * from public.ancestor_window($1,$2,4)',[family,child]);assert.equal(ancestor.rows.length,3);
await actor('other');const foreignBatch=await rpc('stage_import',[otherFamily,JSON.stringify([{record_id:'foreign',full_name:'Other Father'}]),key]);
const foreignReport=await rpc('review_import',[foreignBatch,true]);
await actor('admin'); const cross=await rpc('submit_change',[family,child,'link',JSON.stringify({father_id:foreignReport.ids.foreign}),(await getMember(child)).version,'20000000-0000-4000-8000-000000000003']);
await denied(()=>rpc('review_change',[cross,true,'']),'composite FK prevents cross family ancestry');
await actor('member'); const claim=await rpc('submit_change',[family,child,'claim','{}',(await getMember(child)).version,'20000000-0000-4000-8000-000000000004']);
await actor('admin');await rpc('review_change',[claim,true,'Identity verified']);
await actor('member');assert.equal((await db.query('select * from public.member_private')).rows.length,1,'claimed user sees own profile');
await actor('admin'); await rpc('transfer_admin',[family,users.mod]);
await denied(()=>rpc('set_role',[family,users.member,'moderator']),'former admin loses powers immediately');
await actor('mod');assert.equal((await db.query('select private.role_for($1) as r',[family])).rows[0].r,'admin');
await denied(()=>db.query(`select private.apply_patch($1,$2,'{}')`,[family,child]),'private helper not callable');
const desc=await db.query('select * from public.descendant_window($1,$2,3)',[family,dad]);assert.equal(desc.rows.length,2);
const createKey='20000000-0000-4000-8000-000000000008';
const createChange=await rpc('submit_change',[family,null,'create',JSON.stringify({full_name:'New Person'}),null,createKey]);
const createdId=await rpc('review_change',[createChange,true,'']);assert.equal(await rpc('review_change',[createChange,true,'']),createdId);
await denied(async()=>rpc('submit_change',[family,child,'edit',JSON.stringify({profile:{dob:'2999-01-01'}}),(await getMember(child)).version,'20000000-0000-4000-8000-000000000009']), 'server validates future DOB');
// Operator bootstrap and tenant suspension; global operator sees metadata, not private profiles.
await db.exec('reset role');await db.query('insert into private.super_admins values($1)',[users.other]);await actor('other');
assert.equal((await db.query('select * from public.member_private where family_id=$1',[family])).rows.length,0);
await rpc('configure_tenant',[family,true,JSON.stringify({imports:true,suggestions:true,photos:true})]);
await actor('member');assert.equal((await db.query('select * from public.members where family_id=$1',[family])).rows.length,0);
await denied(()=>rpc('ancestor_window',[family,child,4]),'suspended tenant RPC denied');
await actor('other');await rpc('configure_tenant',[family,false,JSON.stringify({imports:true,suggestions:true,photos:true})]);
await actor('mod');
await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['family-media',`${family}/${child}/test.webp`]);
await actor('member');assert.equal((await db.query('select * from storage.objects')).rows.length,1);
await denied(()=>db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['family-media',`${family}/${child}/member.webp`]),'member image uploads denied');
await actor('other');assert.equal((await db.query('select * from storage.objects')).rows.length,0,'other tenant cannot read image');
await db.exec('reset role; set role anon'); await denied(()=>db.query('select * from public.members'),'anonymous tree denied');
console.log('PASS: migrations and tenant isolation, invitations, role escalation, staged/idempotent imports, duplicate conflicts, approval gates, self-review, cycles, cross-family FKs, traversal, profile claims, ownership transfer, helper grants.');
await db.close();

});
