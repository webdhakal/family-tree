begin;

create table public.member_relationships (
  family_id uuid not null,
  source_id uuid not null,
  target_id uuid not null,
  kind text not null check (kind in ('spouse','son','daughter','adopted_child')),
  primary key (family_id,source_id,target_id,kind),
  foreign key (family_id,source_id) references public.members(family_id,id) on delete cascade,
  foreign key (family_id,target_id) references public.members(family_id,id) on delete cascade,
  check (source_id <> target_id),
  check (kind <> 'spouse' or source_id < target_id)
);
create index member_relationships_target on public.member_relationships(family_id,target_id);
alter table public.member_relationships enable row level security;
revoke all on public.member_relationships from anon,authenticated;
grant select on public.member_relationships to authenticated;
create policy relationships_read on public.member_relationships for select to authenticated
  using (private.can_read(family_id));

-- Called after the approved patch has applied all selections. Spouses are
-- two-way links; any cycle containing a parent-to-child step is invalid.
create function private.check_relationship_generations(f uuid, m uuid) returns void
language plpgsql set search_path='' as $$
begin
  if not exists (select 1 from public.member_relationships where family_id=f) then return; end if;
  if exists (
    with recursive edges(src,dst,descends) as (
      select parent.id, child.id, true
      from public.members child
      cross join lateral unnest(array[child.father_id,child.mother_id]) parent(id)
      where child.family_id=f and parent.id is not null
      union all
      select source_id,target_id,kind <> 'spouse' from public.member_relationships where family_id=f
      union all
      select target_id,source_id,false from public.member_relationships where family_id=f and kind='spouse'
    ), walk(id,descends) as (
      select dst,descends from edges where src=m
      union
      select e.dst,w.descends or e.descends from walk w join edges e on e.src=w.id
    )
    select 1 from walk where id=m and descends
  ) then
    raise exception 'These relationships create an ancestry or generation conflict';
  end if;
end $$;

create function private.apply_relationships(f uuid, m uuid, selections jsonb) returns void
language plpgsql set search_path='' as $$
declare relation_kind text; selected jsonb; ids uuid[];
begin
  for relation_kind,selected in select * from jsonb_each(selections) loop
    select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(selected);
    -- Touch changed counterparts so concurrent proposals cannot overwrite a
    -- reciprocal spouse selection based on an outdated member version.
    with removed as (
      delete from public.member_relationships r
      where r.family_id=f and r.kind=relation_kind
        and (r.source_id=m or (relation_kind='spouse' and r.target_id=m))
        and not ((case when r.source_id=m then r.target_id else r.source_id end)=any(ids))
      returning source_id,target_id
    ), added as (
      insert into public.member_relationships(family_id,source_id,target_id,kind)
      select f, case when relation_kind='spouse' then least(m,id) else m end,
        case when relation_kind='spouse' then greatest(m,id) else id end, relation_kind
      from unnest(ids) id
      on conflict do nothing
      returning source_id,target_id
    ), affected as (
      select source_id as id from removed union select target_id from removed
      union select source_id from added union select target_id from added
    )
    update public.members p set updated_at=now()
    where p.family_id=f and p.id<>m and p.id in (select id from affected);
  end loop;
end $$;
revoke execute on function private.check_relationship_generations(uuid,uuid), private.apply_relationships(uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function private.validate_patch(p jsonb) returns void language plpgsql set search_path='' as $$
declare k text; v jsonb; relation_kind text; selected jsonb; begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>32768 then raise exception 'invalid patch'; end if;
 for k,v in select * from jsonb_each(p) loop
 if k not in ('full_name','gender','relationships','father_id','mother_id','custom_fields','profile') then raise exception 'unknown field %',k; end if;
 if k='full_name' and (jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 1 and 160) then
 raise exception 'invalid full name'; end if;
 if k='gender' and v <> 'null'::jsonb and (jsonb_typeof(v)<>'string' or
   (v#>>'{}') not in ('female','male','non_binary','other','prefer_not_to_say')) then
 raise exception 'invalid gender'; end if;
 if k in ('father_id','mother_id') and jsonb_typeof(v) not in ('string','null') then raise exception 'invalid parent'; end if;
 if k='custom_fields' and jsonb_typeof(v)<>'object' then raise exception 'invalid custom fields'; end if;
 if k='relationships' then
   if jsonb_typeof(v)<>'object' then raise exception 'Invalid relationship selection'; end if;
   for relation_kind,selected in select * from jsonb_each(v) loop
     if relation_kind not in ('spouse','son','daughter','adopted_child') or jsonb_typeof(selected)<>'array' then
       raise exception 'Invalid relationship selection';
     end if;
     if jsonb_array_length(selected)>100 or exists (
       select 1 from jsonb_array_elements(selected) e where jsonb_typeof(e)<>'string'
     ) then raise exception 'Invalid relationship selection'; end if;
     perform value::uuid from jsonb_array_elements_text(selected);
   end loop;
 end if;
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
 if p?'relationships' then
   perform private.apply_relationships(f,m,p->'relationships');
 end if;
 if p ?| array['relationships','father_id','mother_id'] then
   perform private.check_relationship_generations(f,m);
 end if;
 if p?'profile' then
 insert into public.member_private(family_id,member_id) values(f,m) on conflict do nothing;
 select to_jsonb(mp) - 'family_id' - 'member_id' into pr from public.member_private mp where member_id=m;
 pr=pr||(p->'profile');
 update public.member_private set dob=(pr->>'dob')::date,address=pr->>'address',street_address=pr->>'street_address',
 original_address=pr->>'original_address',phone=pr->>'phone',email=pr->>'email',
 social_links=pr->'social_links',map_url=pr->>'map_url',extra_fields=pr->'extra_fields' where member_id=m and family_id=f;
 end if;
end $$;

create or replace function public.stage_import(p_family uuid,p_rows jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$ declare b uuid; r jsonb; begin
 perform private.lock_family(p_family);
 if private.role_for(p_family) is distinct from 'admin' or not private.feature_on(p_family,'imports') then raise exception 'forbidden'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 200
 or octet_length(p_rows::text)>1048576 then raise exception 'import limited to 200 rows / 1 MiB'; end if;
 if (select count(distinct value->>'record_id') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows) then raise exception 'duplicate or missing Record ID'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 if jsonb_typeof(r)<>'object' or coalesce(length(r->>'record_id'),0) not between 1 and 160 then raise exception 'invalid record ID'; end if;
 if r?'relationships' then raise exception 'Add extended relationships after importing people'; end if;
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

commit;
