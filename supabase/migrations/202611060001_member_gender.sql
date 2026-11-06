begin;
alter table public.members add column gender text
  check (gender in ('female','male','non_binary','other','prefer_not_to_say'));

create or replace function private.validate_patch(p jsonb) returns void language plpgsql set search_path='' as $$
declare k text; v jsonb; begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>32768 then raise exception 'invalid patch'; end if;
 for k,v in select * from jsonb_each(p) loop
 if k not in ('full_name','gender','father_id','mother_id','custom_fields','profile') then raise exception 'unknown field %',k; end if;
 if k='full_name' and (jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 1 and 160) then
 raise exception 'invalid full name'; end if;
 if k='gender' and v <> 'null'::jsonb and (jsonb_typeof(v)<>'string' or
   (v#>>'{}') not in ('female','male','non_binary','other','prefer_not_to_say')) then
 raise exception 'invalid gender'; end if;
 if k in ('father_id','mother_id') and jsonb_typeof(v) not in ('string','null') then raise exception 'invalid parent'; end if;
 if k='custom_fields' and jsonb_typeof(v)<>'object' then raise exception 'invalid custom fields'; end if;
 if k='profile' then
 if jsonb_typeof(v)<>'object' or exists(select 1 from jsonb_object_keys(v) x where x not in
 ('dob','address','street_address','original_address','phone','email','social_links','map_url','extra_fields')) then
 raise exception 'invalid profile'; end if;
 if exists(select 1 from jsonb_each(v) e where e.key not in ('social_links','extra_fields')
 and jsonb_typeof(e.value) not in ('string','null')) then raise exception 'profile fields must be strings'; end if;
 if v ? 'social_links' and (jsonb_typeof(v->'social_links')<>'object' or exists(
 select 1 from jsonb_each(v->'social_links') e where e.key not in ('facebook','tiktok','instagram')
 or jsonb_typeof(e.value)<>'string' or (e.value#>>'{}') !~ '^https://')) then raise exception 'invalid social links'; end if;
 if v ? 'extra_fields' and jsonb_typeof(v->'extra_fields')<>'object' then raise exception 'invalid extra fields'; end if;
 if v->>'dob' is not null and ((v->>'dob') !~ '^\d{4}-\d{2}-\d{2}$' or (v->>'dob')::date > current_date) then raise exception 'invalid DOB'; end if;
 end if;
 end loop;
end $$;
create or replace function private.apply_patch(f uuid,m uuid,p jsonb) returns void
language plpgsql security definer set search_path='' as $$ declare pr jsonb; begin
 perform private.validate_patch(p);
 update public.members set
 full_name=case when p?'full_name' then p->>'full_name' else full_name end,
 gender=case when p?'gender' then p->>'gender' else gender end,
 father_id=case when p?'father_id' then (p->>'father_id')::uuid else father_id end,
 mother_id=case when p?'mother_id' then (p->>'mother_id')::uuid else mother_id end,
 custom_fields=case when p?'custom_fields' then p->'custom_fields' else custom_fields end
 where family_id=f and id=m;
 if not found then raise exception 'member unavailable'; end if;
 if p?'profile' then
 insert into public.member_private(family_id,member_id) values(f,m) on conflict do nothing;
 select to_jsonb(mp) - 'family_id' - 'member_id' into pr from public.member_private mp where member_id=m;
 pr=pr||(p->'profile');
 update public.member_private set dob=(pr->>'dob')::date,address=pr->>'address',street_address=pr->>'street_address',
 original_address=pr->>'original_address',phone=pr->>'phone',email=pr->>'email',
 social_links=pr->'social_links',map_url=pr->>'map_url',extra_fields=pr->'extra_fields' where member_id=m and family_id=f;
 end if;
end $$;

create or replace function public.review_import(p_batch uuid,p_approve boolean) returns jsonb
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
 insert into public.members(family_id,full_name,gender,custom_fields)
 values(f,r->>'full_name',r->>'gender',coalesce(r->'custom_fields','{}')) returning id into mid;
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

commit;
