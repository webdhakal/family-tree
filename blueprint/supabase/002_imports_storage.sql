begin;
create table public.import_issues (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id),
 batch_id uuid not null references public.import_batches(id), member_id uuid not null,
 parent_kind text not null check(parent_kind in ('father','mother')), raw_name text not null,
 candidates uuid[] not null default '{}', resolved_at timestamptz,
 foreign key(family_id,member_id) references public.members(family_id,id),
 unique(batch_id,member_id,parent_kind)
);
alter table public.import_issues enable row level security;
revoke all on public.import_issues from anon,authenticated;
grant select on public.import_issues to authenticated;
create policy issues_read on public.import_issues for select to authenticated using(private.can_read(family_id));
create function public.stage_import(p_family uuid,p_rows jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$ declare b uuid; r jsonb; begin
 perform private.lock_family(p_family);
 if private.role_for(p_family) is distinct from 'admin' or not private.feature_on(p_family,'imports') then raise exception 'forbidden'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 200
 or octet_length(p_rows::text)>1048576 then raise exception 'import limited to 200 rows / 1 MiB'; end if;
 if (select count(distinct value->>'record_id') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows) then raise exception 'duplicate or missing Record ID'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 if jsonb_typeof(r)<>'object' or coalesce(length(r->>'record_id'),0) not between 1 and 160 then raise exception 'invalid record ID'; end if;
 perform private.validate_patch(r-array['record_id','father_name','mother_name','father_record_id','mother_record_id']);
 if not r?'full_name' then raise exception 'missing full name'; end if;
 if exists(select 1 from jsonb_each(r) e where e.key in ('father_name','mother_name','father_record_id','mother_record_id')
 and jsonb_typeof(e.value) not in ('string','null')) then raise exception 'invalid parent reference'; end if;
 -- Parent IDs cannot circumvent the explicit import resolver.
 if r?'father_id' or r?'mother_id' then raise exception 'use parent Record ID columns'; end if;
 end loop;
 insert into public.import_batches(family_id,request_key,submitted_by,payload)
 values(p_family,p_key,auth.uid(),p_rows) on conflict(family_id,request_key) do nothing returning id into b;
 if b is null then select id into b from public.import_batches where family_id=p_family and request_key=p_key; end if;
 return b;
end $$;
create function public.review_import(p_batch uuid,p_approve boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.import_batches; f uuid; r jsonb; ids jsonb='{}'; mid uuid; pid uuid;
 kind text; ref text; nm text; candidates uuid[]; issue_count integer=0; result jsonb; begin
 select family_id into f from public.import_batches where id=p_batch;
 perform private.lock_family(f);
 if private.role_for(f) is distinct from 'admin' or not private.feature_on(f,'imports') then raise exception 'forbidden'; end if;
 select * into b from public.import_batches where id=p_batch for update;
 if p_approve is null then raise exception 'approval decision required'; end if;
 if b.status<>'staged' then return b.report; end if;
 if not p_approve then
 update public.import_batches set status='rejected',reviewed_at=now(),report='{"rejected":true}' where id=p_batch;
 perform private.audit(f,'import.rejected',p_batch); return '{"rejected":true}';
 end if;
 -- Pass one inserts identities only, allowing children before parents in the CSV.
 for r in select value from jsonb_array_elements(b.payload) loop
 insert into public.members(family_id,full_name,custom_fields)
 values(f,r->>'full_name',coalesce(r->'custom_fields','{}')) returning id into mid;
 ids=ids||jsonb_build_object(r->>'record_id',mid);
 perform private.apply_patch(f,mid,jsonb_build_object('profile',coalesce(r->'profile','{}')));
 end loop;
 -- Pass two resolves within this batch by Record ID, otherwise by exact normalized name.
 for r in select value from jsonb_array_elements(b.payload) loop
 mid=(ids->>(r->>'record_id'))::uuid;
 foreach kind in array array['father','mother'] loop
 ref=nullif(trim(r->>(kind||'_record_id')),''); nm=nullif(trim(r->>(kind||'_name')),''); pid=null;
 if ref is not null then
 pid=(ids->>ref)::uuid;
 if pid is null then raise exception 'unknown parent Record ID: %',ref; end if;
 elsif nm is not null then
 select array_agg(m.id order by m.id) into candidates from public.members m
 where m.family_id=f and m.name_key=lower(nm) and m.id<>mid;
 if coalesce(cardinality(candidates),0)=1 then pid=candidates[1];
 else
 insert into public.import_issues(family_id,batch_id,member_id,parent_kind,raw_name,candidates)
 values(f,p_batch,mid,kind,nm,coalesce(candidates,'{}')); issue_count=issue_count+1;
 end if;
 end if;
 if pid is not null then perform private.apply_patch(f,mid,jsonb_build_object(kind||'_id',pid)); end if;
 end loop;
 end loop;
 result=jsonb_build_object('created',jsonb_array_length(b.payload),'unresolved',issue_count,'ids',ids);
 update public.import_batches set status='approved',reviewed_at=now(),report=result where id=p_batch;
 perform private.audit(f,'import.approved',p_batch,result-'ids'); return result;
end $$;
create function private.close_import_issue() returns trigger language plpgsql security definer set search_path='' as $$ begin
 update public.import_issues set resolved_at=now() where family_id=new.family_id and member_id=new.id
 and resolved_at is null and ((parent_kind='father' and new.father_id is not null) or (parent_kind='mother' and new.mother_id is not null));
 return new;
end $$;
create trigger import_issue_linked after update on public.members for each row execute function private.close_import_issue();
revoke execute on function private.close_import_issue() from public,anon,authenticated;
revoke execute on function public.stage_import(uuid,jsonb,uuid),public.review_import(uuid,boolean) from public,anon,authenticated;
grant execute on function public.stage_import(uuid,jsonb,uuid),public.review_import(uuid,boolean) to authenticated;

-- Storage objects: only reviewers upload. Members propose photos through a separate future media review flow.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('family-media','family-media',false,524288,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
-- Object name: FAMILY_UUID/MEMBER_UUID/RANDOM_UUID.webp; no public URLs.
create policy family_media_read on storage.objects for select to authenticated using(
 bucket_id='family-media' and exists(select 1 from public.members m
 where m.family_id::text=(storage.foldername(name))[1] and m.id::text=(storage.foldername(name))[2]
 and private.can_read(m.family_id) and private.feature_on(m.family_id,'photos')));
create policy family_media_insert on storage.objects for insert to authenticated with check(
 bucket_id='family-media' and exists(select 1 from public.members m
 where m.family_id::text=(storage.foldername(name))[1] and m.id::text=(storage.foldername(name))[2]
 and private.can_review(m.family_id) and private.feature_on(m.family_id,'photos')));
create policy family_media_delete on storage.objects for delete to authenticated using(
 bucket_id='family-media' and exists(select 1 from public.members m
 where m.family_id::text=(storage.foldername(name))[1] and m.id::text=(storage.foldername(name))[2]
 and private.can_review(m.family_id) and private.feature_on(m.family_id,'photos')));
commit;
