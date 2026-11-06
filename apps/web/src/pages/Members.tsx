import { useMemo, useRef, useState } from 'react';
import { relatedIds, relationshipLabels, type Relationship, type RelationshipKind } from '@family-tree/core/relationships';
import { genderOptions } from '@family-tree/core/gender';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Search, MapPin, UserCheck, Pencil, GitBranch } from 'lucide-react';
import type { WorkspaceProps } from '../components/Shell';
import { db, rpc, refresh, type Person, type PrivateProfile } from '../lib';
import { Empty, Modal, initials, useAction, ActionStatus, Loading, ErrorBox } from '../components/UI';
import { PersonEditor } from '../components/PersonEditor';
export function Members(props: WorkspaceProps) {
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Person>();
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Person | null>(null);
  const directory = useMemo(() => [...props.people].sort((a, b) => a.full_name.localeCompare(b.full_name)), [props.people]);
  const names = useMemo(() => new Map(directory.map(person => [person.id, person.full_name])), [directory]);
  const term = search.trim().toLocaleLowerCase();
  const shown = directory.filter(person => person.full_name.toLocaleLowerCase().includes(term));
  return <div className="page-body">
    <div className="page-heading">
      <div><span className="eyebrow">Family directory</span><h1>People</h1><p>Find a relative and open their family record.</p></div>
      <button className="primary" onClick={() => setAdding(true)}><Plus size={17} aria-hidden="true"/> Add a person</button>
    </div>
    <div className="toolbar people-toolbar">
      <label className="search"><Search size={18} aria-hidden="true"/>
        <input type="search" aria-label="Search people by name" placeholder="Search by name" value={search} onChange={event => setSearch(event.target.value)}/>
      </label>
      <span className="muted" role="status">{shown.length} {shown.length === 1 ? 'person' : 'people'}</span>
    </div>
    <div className="people-grid">{shown.map(person => <button className="person-card" key={person.id} onClick={() => setDetail(person)}>
      <div className="person-card-heading">
        <span className="person-avatar" aria-hidden="true">{initials(person.full_name)}</span>
        <div><h3>{person.full_name}</h3>
          <p>{person.linked_user_id === props.user.id ? 'Your verified record' : person.linked_user_id ? 'Account connected' : 'Family record'}</p>
        </div>
        <ChevronRight size={17} aria-hidden="true"/>
      </div>
      {(person.father_id || person.mother_id) && <div className="person-relations">
        {person.father_id && <span>Father <strong>{names.get(person.father_id) ?? 'Unknown'}</strong></span>}
        {person.mother_id && <span>Mother <strong>{names.get(person.mother_id) ?? 'Unknown'}</strong></span>}
      </div>}
    </button>)}</div>
    {!shown.length && <Empty title={term ? 'No matching people' : 'Your family directory starts here'}>
      <p>{term ? 'Try another name.' : 'Add a person to begin connecting your family.'}</p>
    </Empty>}
    {(adding || edit) && <PersonEditor {...props} person={edit} close={() => { setAdding(false); setEdit(undefined); }}/>}
    {detail && <PersonDetails {...props} person={detail} close={() => setDetail(null)} edit={() => { setEdit(detail); setDetail(null); }}/>}
  </div>;
}

export function PersonDetails({person,close,edit,focus,...props}:WorkspaceProps&{person:Person;close:()=>void;edit?:()=>void;focus?:(id:string)=>void}){
  const [editing,setEditing]=useState(false);const action=useAction();const key=useRef(crypto.randomUUID());
  const profile=useQuery({queryKey:['profile',props.family.id,person.id],queryFn:async()=>{const {data,error}=await db().from('member_private').select('*').eq('family_id',props.family.id).eq('member_id',person.id).maybeSingle();if(error)throw error;return data as PrivateProfile|null;}});
  if(editing)return <PersonEditor {...props} person={person} close={close}/>;
  return <Modal title="Family record" close={close}><div className="profile-heading"><span className="person-avatar large-avatar">{initials(person.full_name)}</span><div><h2>{person.full_name}</h2><span className="badge">{person.linked_user_id===props.user.id?'Your verified profile':person.linked_user_id?'Account connected':'Family member'}</span></div></div><div className="detail-list"><div><dt>Gender</dt><dd>{person.gender ? genderOptions[person.gender] : 'Not recorded'}</dd></div><div><dt>Father</dt><dd>{props.people.find(p=>p.id===person.father_id)?.full_name||'Unknown / not linked'}</dd></div><div><dt>Mother</dt><dd>{props.people.find(p=>p.id===person.mother_id)?.full_name||'Unknown / not linked'}</dd></div>{Object.entries(person.custom_fields).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{typeof v==='object'?JSON.stringify(v):String(v)}</dd></div>)}</div>
    <RelationshipDetails person={person} people={props.people} relationships={props.relationships}/>
    {profile.isPending?<Loading text="Loading personal details…"/>:profile.error?<ErrorBox error={profile.error}/>:profile.data?<><h3>Personal details</h3><div className="detail-list">{Object.entries(profile.data).filter(([k,v])=>!['family_id','member_id'].includes(k)&&v&&typeof v!=='object').map(([k,v])=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd>{String(v)}</dd></div>)}</div></>:<p className="privacy-inline"><MapPin size={16}/> Personal details are visible to this person’s verified account and family reviewers.</p>}
    <ActionStatus action={action}/><div className="button-row">{focus&&<button className="secondary" onClick={()=>focus(person.id)}><GitBranch size={16}/> Focus tree here</button>}<button className="primary" onClick={()=>edit?edit():setEditing(true)}><Pencil size={16}/> {props.role==='admin'?'Edit record':'Suggest changes'}</button></div>
    {!person.linked_user_id&&<button className="secondary full" disabled={action.busy} onClick={()=>void action.run(async()=>{await rpc('submit_change',{p_family:props.family.id,p_member:person.id,p_kind:'claim',p_patch:{},p_version:person.version,p_key:key.current});await refresh();},'Identity claim sent for verification.')}><UserCheck size={17}/> This is my record — request verification</button>}
    <p className="muted small">Node {person.id} · Record version {person.version}</p>
  </Modal>;
}

export function RelationshipDetails({person,people,relationships}: {
  person: Pick<Person,'id'>; people: Pick<Person,'id'|'full_name'>[]; relationships: Relationship[];
}) {
  const groups: {label:string;ids:string[]}[] = (Object.keys(relationshipLabels) as RelationshipKind[]).map(kind =>
    ({label:relationshipLabels[kind],ids:relatedIds(relationships,person.id,kind)}));
  for (const [label,kinds] of [['Parent links',['son','daughter']],['Adoptive parents',['adopted_child']]] as const) {
    groups.push({label,ids:[...new Set(relationships.filter(link =>
      link.target_id===person.id && kinds.some(kind=>kind===link.kind)).map(link=>link.source_id))]});
  }
  const names = new Map(people.map(record=>[record.id,record.full_name]));
  return <dl className="detail-list">{groups.filter(group=>group.ids.length>0).map(group=>
    <div key={group.label}><dt>{group.label}</dt><dd>{group.ids.map(id=>names.get(id) ?? 'Unknown person').join(', ')}</dd></div>,
  )}</dl>;
}
