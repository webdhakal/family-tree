import { useRef, useState } from 'react';
import { genderOptions } from '@family-tree/core/gender';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, MapPin, UserCheck, Pencil, GitBranch } from 'lucide-react';
import type { WorkspaceProps } from '../components/Shell';
import { db, rpc, refresh, type Person, type PrivateProfile } from '../lib';
import { Empty, Modal, initials, useAction, ActionStatus, Loading, ErrorBox } from '../components/UI';
import { PersonEditor } from '../components/PersonEditor';
export function Members(props:WorkspaceProps){
  const [search,setSearch]=useState(''),[edit,setEdit]=useState<Person|undefined>(),[adding,setAdding]=useState(false),[detail,setDetail]=useState<Person|null>(null);
  const shown=props.people.filter(p=>p.full_name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="page-body"><div className="page-heading"><div><span className="eyebrow">THE PEOPLE WHO CONNECT US</span><h1>Family people</h1><p>A place for every person in your family’s story.</p></div><button className="primary" onClick={()=>setAdding(true)}><Plus size={17}/> Add a person</button></div><div className="toolbar people-toolbar"><label className="search"><Search size={18}/><input placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/></label><span className="muted">{shown.length} people</span></div>
    <div className="people-grid">{shown.map(p=><button className="person-card" key={p.id} onClick={()=>setDetail(p)}><span className="person-avatar large-avatar">{initials(p.full_name)}</span><h3>{p.full_name}</h3><p>{p.linked_user_id===props.user.id?'Your verified record':p.linked_user_id?'Account connected':'Family record'}</p><div className="person-relations"><span>Father <strong>{props.people.find(x=>x.id===p.father_id)?.full_name||'Not linked'}</strong></span><span>Mother <strong>{props.people.find(x=>x.id===p.mother_id)?.full_name||'Not linked'}</strong></span></div><span className="node-id">Node {p.id.slice(0,8)}</span></button>)}</div>
    {!shown.length&&<Empty title={search?'No matching people':'Your family directory starts here'}><p>{search?'Try another name.':'Add a person to begin connecting your family.'}</p></Empty>}
    {(adding||edit)&&<PersonEditor {...props} person={edit} close={()=>{setAdding(false);setEdit(undefined);}}/>}
    {detail&&<PersonDetails {...props} person={detail} close={()=>setDetail(null)} edit={()=>{setEdit(detail);setDetail(null);}}/>}
  </div>;
}
export function PersonDetails({person,close,edit,focus,...props}:WorkspaceProps&{person:Person;close:()=>void;edit?:()=>void;focus?:(id:string)=>void}){
  const [editing,setEditing]=useState(false);const action=useAction();const key=useRef(crypto.randomUUID());
  const profile=useQuery({queryKey:['profile',props.family.id,person.id],queryFn:async()=>{const {data,error}=await db().from('member_private').select('*').eq('family_id',props.family.id).eq('member_id',person.id).maybeSingle();if(error)throw error;return data as PrivateProfile|null;}});
  if(editing)return <PersonEditor {...props} person={person} close={close}/>;
  return <Modal title="Family record" close={close}><div className="profile-heading"><span className="person-avatar large-avatar">{initials(person.full_name)}</span><div><h2>{person.full_name}</h2><span className="badge">{person.linked_user_id===props.user.id?'Your verified profile':person.linked_user_id?'Account connected':'Family member'}</span></div></div><div className="detail-list"><div><dt>Gender</dt><dd>{person.gender ? genderOptions[person.gender] : 'Not recorded'}</dd></div><div><dt>Father</dt><dd>{props.people.find(p=>p.id===person.father_id)?.full_name||'Unknown / not linked'}</dd></div><div><dt>Mother</dt><dd>{props.people.find(p=>p.id===person.mother_id)?.full_name||'Unknown / not linked'}</dd></div>{Object.entries(person.custom_fields).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{typeof v==='object'?JSON.stringify(v):String(v)}</dd></div>)}</div>
    {profile.isPending?<Loading text="Loading personal details…"/>:profile.error?<ErrorBox error={profile.error}/>:profile.data?<><h3>Personal details</h3><div className="detail-list">{Object.entries(profile.data).filter(([k,v])=>!['family_id','member_id'].includes(k)&&v&&typeof v!=='object').map(([k,v])=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd>{String(v)}</dd></div>)}</div></>:<p className="privacy-inline"><MapPin size={16}/> Personal details are visible to this person’s verified account and family reviewers.</p>}
    <ActionStatus action={action}/><div className="button-row">{focus&&<button className="secondary" onClick={()=>focus(person.id)}><GitBranch size={16}/> Focus tree here</button>}<button className="primary" onClick={()=>edit?edit():setEditing(true)}><Pencil size={16}/> {props.role==='admin'?'Edit record':'Suggest changes'}</button></div>
    {!person.linked_user_id&&<button className="secondary full" disabled={action.busy} onClick={()=>void action.run(async()=>{await rpc('submit_change',{p_family:props.family.id,p_member:person.id,p_kind:'claim',p_patch:{},p_version:person.version,p_key:key.current});await refresh();},'Identity claim sent for verification.')}><UserCheck size={17}/> This is my record — request verification</button>}
    <p className="muted small">Node {person.id} · Record version {person.version}</p>
  </Modal>;
}
