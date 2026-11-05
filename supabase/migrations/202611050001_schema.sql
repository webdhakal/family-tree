-- Apply to a fresh Supabase database as migration owner. Clients never receive service_role.
begin;
create schema if not exists private;
revoke all on schema private from public;
create table private.super_admins (
  user_id uuid primary key references auth.users(id) on delete restrict
);
alter table private.super_admins enable row level security;
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  created_by uuid not null unique references auth.users(id) on delete restrict,
  admin_user_id uuid not null unique references auth.users(id) on delete restrict,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  enabled_features jsonb not null default '{"imports":true,"suggestions":true,"photos":true}',
  allowed_features jsonb not null default '{"imports":true,"suggestions":true,"photos":true}',
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);
-- Admin is derived ONLY from families.admin_user_id: structurally exactly one, never two.
-- Every admin also has a membership row. This eliminates a duplicated mutable admin role.
create table public.user_roles (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'member' check (role in ('member','moderator')),
  primary key (family_id,user_id)
);
alter table public.families add constraint admin_is_member
  foreign key (id,admin_user_id) references public.user_roles(family_id,user_id)
  deferrable initially deferred;
create index user_roles_user on public.user_roles(user_id,family_id);
create table public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  name_key text generated always as (lower(trim(full_name))) stored,
  father_id uuid, mother_id uuid,
  linked_user_id uuid,
  -- Registry-controlled lineage fields only; do not place contact details in this object.
  custom_fields jsonb not null default '{}' check (jsonb_typeof(custom_fields)='object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id,id), unique (family_id,linked_user_id),
  foreign key (family_id,father_id) references public.members(family_id,id) on delete restrict,
  foreign key (family_id,mother_id) references public.members(family_id,id) on delete restrict,
  foreign key (family_id,linked_user_id) references public.user_roles(family_id,user_id),
  check (father_id is distinct from id and mother_id is distinct from id),
  check (father_id is null or mother_id is null or father_id <> mother_id)
);
create index members_names on public.members(family_id,name_key);
create index members_father on public.members(family_id,father_id);
create index members_mother on public.members(family_id,mother_id);
create table public.member_private (
  family_id uuid not null, member_id uuid primary key,
  dob date check (dob is null or dob >= date '1000-01-01'),
  address text, street_address text, original_address text,
  phone text, email text, social_links jsonb not null default '{}', map_url text,
  extra_fields jsonb not null default '{}',
  foreign key (family_id,member_id) references public.members(family_id,id) on delete cascade,
  check (jsonb_typeof(social_links)='object' and jsonb_typeof(extra_fields)='object'),
  check (map_url is null or map_url ~ '^https://')
);
create table public.pending_changes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid,
  kind text not null check (kind in ('create','edit','link','claim')),
  patch jsonb not null check (jsonb_typeof(patch)='object' and octet_length(patch::text)<=32768),
  base_version integer,
  submitted_by uuid not null references auth.users(id),
  request_key uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  result_member_id uuid,
  reviewed_by uuid references auth.users(id), review_note text,
  created_at timestamptz not null default now(), reviewed_at timestamptz,
  unique(family_id,submitted_by,request_key),
  foreign key(family_id,member_id) references public.members(family_id,id),
  foreign key(family_id,result_member_id) references public.members(family_id,id),
  check ((kind='create' and member_id is null and base_version is null)
      or (kind<>'create' and member_id is not null and base_version is not null))
);
create index pending_queue on public.pending_changes(family_id,status,created_at);
create table public.import_batches (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id),
  request_key uuid not null, submitted_by uuid not null references auth.users(id),
  payload jsonb not null check (jsonb_typeof(payload)='array'),
  status text not null default 'staged' check(status in ('staged','approved','rejected')),
  report jsonb, created_at timestamptz not null default now(), reviewed_at timestamptz,
  unique(family_id,request_key)
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id),
  token_hash text not null unique, email text not null, expires_at timestamptz not null,
  accepted_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id), actor_id uuid references auth.users(id),
  action text not null, entity_id uuid, detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_family on public.audit_events(family_id,created_at desc);

create function private.is_super() returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from private.super_admins where user_id=auth.uid()) $$;
create function private.role_for(f uuid) returns text language sql stable security definer set search_path=''
as $$ select case when f.admin_user_id=auth.uid() then 'admin' else r.role end
 from public.families f join public.user_roles r on r.family_id=f.id and r.user_id=auth.uid()
 where f.id=$1 and not f.suspended $$;
create function private.can_read(f uuid) returns boolean language sql stable security definer set search_path=''
as $$ select coalesce(private.role_for(f) is not null,false) $$;
create function private.can_review(f uuid) returns boolean language sql stable security definer set search_path=''
as $$ select coalesce(private.role_for(f) in ('admin','moderator'),false) $$;
create function private.feature_on(f uuid,k text) returns boolean language sql stable security definer set search_path=''
as $$ select coalesce((enabled_features->>k)::boolean,false)
 and coalesce((allowed_features->>k)::boolean,false) from public.families where id=f $$;
-- Every mutation takes this row lock FIRST: prevents concurrent ancestry cycles and role races.
create function private.lock_family(f uuid) returns void language plpgsql security definer set search_path=''
as $$ begin
 perform 1 from public.families where id=f for update;
 if not found then raise exception 'family unavailable'; end if;
end $$;
create function private.audit(f uuid,a text,e uuid,d jsonb default '{}') returns void
language sql security definer set search_path='' as $$
 insert into public.audit_events(family_id,actor_id,action,entity_id,detail) values(f,auth.uid(),a,e,d)
$$;
create function private.guard_graph() returns trigger language plpgsql security definer set search_path=''
as $$ declare bad boolean; begin
 perform private.lock_family(new.family_id);
 if tg_op='UPDATE' and (new.id<>old.id or new.family_id<>old.family_id) then
   raise exception 'immutable identity';
 end if;
 with recursive ancestors(id) as (
   select x from unnest(array[new.father_id,new.mother_id]) x where x is not null
   union
   select x from ancestors a join public.members m on m.id=a.id and m.family_id=new.family_id
   cross join lateral unnest(array[m.father_id,m.mother_id]) x where x is not null
 ) select exists(select 1 from ancestors where id=new.id) into bad;
 if bad then raise exception 'ancestry cycle'; end if;
 if tg_op='UPDATE' then new.version=old.version+1; new.updated_at=now(); end if;
 return new;
end $$;
create trigger members_guard before insert or update on public.members
for each row execute function private.guard_graph();

-- RLS is a read boundary. No direct application table writes are granted.
alter table public.families enable row level security;
alter table public.user_roles enable row level security;
alter table public.members enable row level security;
alter table public.member_private enable row level security;
alter table public.pending_changes enable row level security;
alter table public.import_batches enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_events enable row level security;
create policy family_read on public.families for select to authenticated
using(private.can_read(id) or private.is_super());
create policy role_read on public.user_roles for select to authenticated
using(private.can_read(family_id));
create policy tree_read on public.members for select to authenticated
using(private.can_read(family_id));
create policy private_read on public.member_private for select to authenticated
using(private.can_review(family_id) or (private.can_read(family_id) and exists(
 select 1 from public.members m where m.id=member_id and m.family_id=member_private.family_id
 and m.linked_user_id=auth.uid())));
create policy changes_read on public.pending_changes for select to authenticated
using(private.can_read(family_id) and (submitted_by=auth.uid() or private.can_review(family_id)));
create policy imports_read on public.import_batches for select to authenticated
using(private.role_for(family_id)='admin');
create policy audit_read on public.audit_events for select to authenticated
using(private.role_for(family_id)='admin' or private.is_super());
-- Invitations have no SELECT policy. Tokens are returned once by create_invitation().

create function public.create_family(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$ declare f uuid; begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 insert into public.families(name,created_by,admin_user_id) values(p_name,auth.uid(),auth.uid()) returning id into f;
 insert into public.user_roles(family_id,user_id) values(f,auth.uid());
 perform private.audit(f,'family.created',f); return f;
end $$;
create function public.set_role(p_family uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$ begin
 perform private.lock_family(p_family);
 if private.role_for(p_family) is distinct from 'admin' or p_role not in ('member','moderator') then
 raise exception 'forbidden'; end if;
 if exists(select 1 from public.families where id=p_family and admin_user_id=p_user) then
 raise exception 'use transfer_admin'; end if;
 update public.user_roles set role=p_role where family_id=p_family and user_id=p_user;
 if not found then raise exception 'invite user first'; end if;
 perform private.audit(p_family,'role.changed',p_user,jsonb_build_object('role',p_role));
end $$;
create function public.transfer_admin(p_family uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
 perform private.lock_family(p_family);
 if private.role_for(p_family) is distinct from 'admin' then raise exception 'forbidden'; end if;
 if not exists(select 1 from public.user_roles where family_id=p_family and user_id=p_user) then
 raise exception 'target must be a tenant member'; end if;
 update public.families set admin_user_id=p_user where id=p_family;
 update public.user_roles set role='member' where family_id=p_family and user_id in (auth.uid(),p_user);
 perform private.audit(p_family,'admin.transferred',p_user);
end $$;
create function public.configure_family(p_family uuid,p_name text,p_settings jsonb,p_enabled jsonb)
returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.lock_family(p_family);
 if private.role_for(p_family) is distinct from 'admin' then raise exception 'forbidden'; end if;
 if jsonb_typeof(p_enabled)<>'object' or exists(select 1 from jsonb_each(p_enabled) e
 where e.key not in ('imports','suggestions','photos') or jsonb_typeof(e.value)<>'boolean') then
 raise exception 'invalid features'; end if;
 update public.families set name=p_name,settings=p_settings,enabled_features=p_enabled where id=p_family;
 perform private.audit(p_family,'family.configured',p_family);
end $$;
create function public.configure_tenant(p_family uuid,p_suspended boolean,p_allowed jsonb)
returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.lock_family(p_family);
 if not private.is_super() then raise exception 'forbidden'; end if;
 if jsonb_typeof(p_allowed)<>'object' or exists(select 1 from jsonb_each(p_allowed) e
 where e.key not in ('imports','suggestions','photos') or jsonb_typeof(e.value)<>'boolean') then
 raise exception 'invalid features'; end if;
 update public.families set suspended=p_suspended,allowed_features=p_allowed where id=p_family;
 perform private.audit(p_family,'tenant.configured',p_family);
end $$;
create function public.create_invitation(p_family uuid,p_email text) returns text
language plpgsql security definer set search_path='' as $$ declare t text; begin
 perform private.lock_family(p_family);
 if private.role_for(p_family) is distinct from 'admin' then raise exception 'forbidden'; end if;
 t=gen_random_uuid()::text||gen_random_uuid()::text;
 insert into public.invitations(family_id,token_hash,email,expires_at)
 values(p_family,encode(sha256(convert_to(t,'UTF8')),'hex'),lower(trim(p_email)),now()+interval '7 days');
 perform private.audit(p_family,'invitation.created',null); return t;
end $$;
create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$ declare i public.invitations; email_address text; f uuid; begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select family_id into f from public.invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 perform private.lock_family(f);
 select * into i from public.invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 select lower(email) into email_address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if i.id is null or i.accepted_by is not null or i.expires_at<=now() or email_address is distinct from i.email
 or exists(select 1 from public.families where id=f and suspended) then raise exception 'invalid invitation'; end if;
 insert into public.user_roles(family_id,user_id) values(i.family_id,auth.uid()) on conflict do nothing;
 update public.invitations set accepted_by=auth.uid() where id=i.id;
 perform private.audit(f,'invitation.accepted',i.id); return f;
end $$;

-- One validator shared by imports and reviewed edits; unknown keys fail closed.
create function private.validate_patch(p jsonb) returns void language plpgsql set search_path='' as $$
declare k text; v jsonb; begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>32768 then raise exception 'invalid patch'; end if;
 for k,v in select * from jsonb_each(p) loop
 if k not in ('full_name','father_id','mother_id','custom_fields','profile') then raise exception 'unknown field %',k; end if;
 if k='full_name' and (jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 1 and 160) then
 raise exception 'invalid full name'; end if;
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
create function private.apply_patch(f uuid,m uuid,p jsonb) returns void
language plpgsql security definer set search_path='' as $$ declare pr jsonb; begin
 perform private.validate_patch(p);
 update public.members set
 full_name=case when p?'full_name' then p->>'full_name' else full_name end,
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
create function public.submit_change(p_family uuid,p_member uuid,p_kind text,p_patch jsonb,p_version integer,p_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$ declare c uuid; begin
 perform private.lock_family(p_family);
 if not private.can_read(p_family) then raise exception 'forbidden'; end if;
 if p_kind in ('link','claim') and not private.feature_on(p_family,'suggestions') then raise exception 'feature disabled'; end if;
 perform private.validate_patch(p_patch);
 if p_kind='claim' and p_patch<>'{}'::jsonb then raise exception 'claim patch must be empty'; end if;
 if p_kind='link' and (p_patch='{}'::jsonb or exists(select 1 from jsonb_object_keys(p_patch) x
 where x not in ('father_id','mother_id'))) then raise exception 'invalid link patch'; end if;
 if p_kind<>'create' and not exists(select 1 from public.members where family_id=p_family and id=p_member) then
 raise exception 'member unavailable'; end if;
 insert into public.pending_changes(family_id,member_id,kind,patch,base_version,submitted_by,request_key)
 values(p_family,p_member,p_kind,p_patch,p_version,auth.uid(),p_key)
 on conflict(family_id,submitted_by,request_key) do nothing returning id into c;
 if c is null then select id into c from public.pending_changes where family_id=p_family and submitted_by=auth.uid() and request_key=p_key; end if;
 return c;
end $$;
create function public.review_change(p_change uuid,p_approve boolean,p_note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.pending_changes; f uuid; m uuid; v integer; begin
 select family_id into f from public.pending_changes where id=p_change;
 perform private.lock_family(f);
 if not private.can_review(f) then raise exception 'forbidden'; end if;
 select * into c from public.pending_changes where id=p_change for update;
 if p_approve is null then raise exception 'approval decision required'; end if;
 if c.status<>'pending' then return c.result_member_id; end if;
 if c.submitted_by=auth.uid() and private.role_for(f)<>'admin' then raise exception 'another reviewer required'; end if;
 m=c.member_id;
 if p_approve then
 -- Revoked memberships cannot retain pending claims or edits for later approval.
 if not exists(select 1 from public.user_roles where family_id=f and user_id=c.submitted_by) then raise exception 'submitter no longer a member'; end if;
 if c.kind in ('link','claim') and not private.feature_on(f,'suggestions') then raise exception 'feature disabled'; end if;
 if c.kind='create' then
 insert into public.members(family_id,full_name) values(f,c.patch->>'full_name') returning id into m;
 perform private.apply_patch(f,m,c.patch);
 else
 select version into v from public.members where family_id=f and id=m for update;
 if v is distinct from c.base_version then raise exception 'stale change; refresh and resubmit'; end if;
 if c.kind='claim' then
 update public.members set linked_user_id=c.submitted_by where family_id=f and id=m and linked_user_id is null;
 if not found then raise exception 'profile already claimed'; end if;
 else perform private.apply_patch(f,m,c.patch); end if;
 end if;
 end if;
 update public.pending_changes set status=case when p_approve then 'approved' else 'rejected' end,
 reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note,result_member_id=m where id=p_change;
 perform private.audit(f,case when p_approve then 'change.approved' else 'change.rejected' end,p_change,
 jsonb_build_object('member_id',m,'kind',c.kind)); return m;
end $$;

-- Suggestions expose tree labels only, never phone, full DOB or email.
create function public.parent_candidates(p_family uuid,p_member uuid,p_name text)
returns table(id uuid,full_name text,father_id uuid,mother_id uuid)
language plpgsql security definer set search_path='' as $$ begin
 if not private.can_read(p_family) or not private.feature_on(p_family,'suggestions') then raise exception 'forbidden'; end if;
 return query with recursive descendants(id) as (
 select m.id from public.members m where m.id=p_member and m.family_id=p_family
 union
 select m.id from public.members m join descendants d on m.father_id=d.id or m.mother_id=d.id where m.family_id=p_family
 ) select m.id,m.full_name,m.father_id,m.mother_id from public.members m
 where m.family_id=p_family and m.name_key=lower(trim(p_name))
 and not exists(select 1 from descendants d where d.id=m.id)
 order by m.full_name,m.id limit 25;
end $$;
-- A bounded ancestor window, with one row per person despite pedigree collapse.
create function public.ancestor_window(p_family uuid,p_member uuid,p_depth integer default 4)
returns table(id uuid,full_name text,father_id uuid,mother_id uuid,generation integer,version integer)
language plpgsql security definer set search_path='' as $$ begin
 if not private.can_read(p_family) then raise exception 'forbidden'; end if;
 if p_depth is null or p_depth not between 0 and 8 then raise exception 'depth must be 0..8'; end if;
 return query with recursive a(id,g) as (
 select m.id,0 from public.members m where m.family_id=p_family and m.id=p_member
 union
 select x,a.g+1 from a join public.members m on m.id=a.id and m.family_id=p_family
 cross join lateral unnest(array[m.father_id,m.mother_id]) x where x is not null and a.g<p_depth
 ) select m.id,m.full_name,m.father_id,m.mother_id,max(a.g),m.version
 from a join public.members m on m.id=a.id and m.family_id=p_family group by m.id;
end $$;

-- Breadth-first descendant view: hard depth and total-node limits bound wide families.
create function public.descendant_window(p_family uuid,p_member uuid,p_depth integer default 3)
returns table(id uuid,full_name text,father_id uuid,mother_id uuid,generation integer,version integer)
language plpgsql security definer set search_path='' as $$
declare frontier uuid[]; seen uuid[]; next_ids uuid[]; g integer; begin
 if not private.can_read(p_family) then raise exception 'forbidden'; end if;
 if p_depth is null or p_depth not between 0 and 8 then raise exception 'depth must be 0..8'; end if;
 select array_agg(m.id) into frontier from public.members m where m.id=p_member and m.family_id=p_family;
 if frontier is null then return; end if;
 seen=frontier;
 for g in 0..p_depth loop
 return query select m.id,m.full_name,m.father_id,m.mother_id,g,m.version
 from public.members m where m.family_id=p_family and m.id=any(frontier);
 exit when g=p_depth;
 select array_agg(t.id) into next_ids from (
 select m.id from public.members m where m.family_id=p_family
 and (m.father_id=any(frontier) or m.mother_id=any(frontier)) and not m.id=any(seen)
 order by m.id limit 501-cardinality(seen)) t;
 exit when next_ids is null;
 if cardinality(seen)+cardinality(next_ids)>500 then raise exception 'view exceeds 500 nodes; choose a smaller branch'; end if;
 seen=seen||next_ids; frontier=next_ids;
 end loop;
end $$;

-- Deny default grants, including future functions; expose only named RPCs.
revoke all on all tables in schema public from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_super(),private.role_for(uuid),private.can_read(uuid),private.can_review(uuid),private.feature_on(uuid,text) to authenticated;
grant select on public.families,public.user_roles,public.members,public.member_private,public.pending_changes,public.import_batches,public.audit_events to authenticated;
grant execute on function public.create_family(text),public.set_role(uuid,uuid,text),public.transfer_admin(uuid,uuid),
 public.configure_family(uuid,text,jsonb,jsonb),public.configure_tenant(uuid,boolean,jsonb),
 public.create_invitation(uuid,text),public.accept_invitation(text),
 public.submit_change(uuid,uuid,text,jsonb,integer,uuid),public.review_change(uuid,boolean,text),
 public.parent_candidates(uuid,uuid,text),public.ancestor_window(uuid,uuid,integer),public.descendant_window(uuid,uuid,integer) to authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
commit;
