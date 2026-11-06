import { useRef, useState } from 'react';
import { relatedIds, relationshipLabels, type RelationshipKind } from '@family-tree/core/relationships';
import { RelationshipPicker } from './RelationshipPicker';
import { genderOptions, type Gender } from '@family-tree/core/gender';
import { useQuery } from '@tanstack/react-query';
import { db, rpc, refresh, type Person, type PrivateProfile, publicProfileFields } from '../lib';
import type { WorkspaceProps } from './Shell';
import { Modal, useAction, ActionStatus } from './UI';
const labels:Record<string,string>={dob:'Date of birth',address:'Current location',street_address:'Street address',original_address:'Ancestral origin',phone:'Phone',email:'Email',map_url:'Map URL'};
export function PersonEditor({person,close,...props}:WorkspaceProps&{person?:Person;close:()=>void}) {
  const [name,setName]=useState(person?.full_name||''),[father,setFather]=useState(person?.father_id||''),[mother,setMother]=useState(person?.mother_id||'');
  const [gender,setGender]=useState<Gender|''>(person?.gender || '');
  const [selections,setSelections]=useState<Partial<Record<RelationshipKind,string[]>>>({});
  const candidates=props.people.filter(record=>record.id!==person?.id);
  const [profile,setProfile]=useState<PrivateProfile>({}),[social,setSocial]=useState<string|undefined>(),[custom,setCustom]=useState(JSON.stringify(person?.custom_fields||{},null,2));
  const action=useAction();const key=useRef(crypto.randomUUID());
  const current=useQuery({queryKey:['profile',props.family.id,person?.id],enabled:!!person,queryFn:async()=>{const {data,error}=await db().from('member_private').select('*').eq('family_id',props.family.id).eq('member_id',person!.id).maybeSingle();if(error)throw error;return data as PrivateProfile|null;}});
  const privateVisible=!person||props.role!=='member'||person.linked_user_id===props.user.id;
  async function save(){
    let parsedSocial:unknown=undefined; if(social!==undefined){parsedSocial=JSON.parse(social||'{}');if(!parsedSocial||Array.isArray(parsedSocial)||typeof parsedSocial!=='object')throw new Error('Social links must be a JSON object.');}
    const parsedCustom:unknown=JSON.parse(custom);if(!parsedCustom||Array.isArray(parsedCustom)||typeof parsedCustom!=='object')throw new Error('Lineage fields must be a JSON object.');
    const changedProfile={...profile,...(parsedSocial?{social_links:parsedSocial}:{})};
    const patch={full_name:name.trim(),...(gender !== (person?.gender || '') ? { gender: gender || null } : {}),father_id:father||null,mother_id:mother||null,...(Object.keys(selections).length ? {relationships:selections} : {}),custom_fields:parsedCustom,...(Object.keys(changedProfile).length?{profile:changedProfile}:{})};
    const change=await rpc<string>('submit_change',{p_family:props.family.id,p_member:person?.id||null,p_kind:person?'edit':'create',p_patch:patch,p_version:person?.version||null,p_key:key.current});
    if(props.role==='admin')await rpc('review_change',{p_change:change,p_approve:true,p_note:'Verified by Family Admin'});
    await refresh();close();
  }
  function changed(){key.current=crypto.randomUUID();action.reset();}
  return <Modal title={person?'Update person':'Add a person'} close={close}><p className="muted">{props.role==='admin'?'Save a verified family record.':'Your changes will be sent to a family reviewer before the tree updates.'}</p><form onSubmit={e=>{e.preventDefault();void action.run(save);}} onChange={changed}>
    <label>Full name<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Gender (optional)<select value={gender} onChange={e=>setGender(e.target.value as Gender|'')}>
      <option value="">Not recorded</option>
      {Object.entries(genderOptions).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label>
    <div className="form-grid"><label>Father<select value={father} onChange={e=>setFather(e.target.value)}><option value="">Unknown / not linked</option>{props.people.filter(p=>p.id!==person?.id).map(p=><option key={p.id} value={p.id}>{p.full_name} · {p.id.slice(0,8)}</option>)}</select></label><label>Mother<select value={mother} onChange={e=>setMother(e.target.value)}><option value="">Unknown / not linked</option>{props.people.filter(p=>p.id!==person?.id).map(p=><option key={p.id} value={p.id}>{p.full_name} · {p.id.slice(0,8)}</option>)}</select></label></div>
    <section className="person-relationships" aria-label="Family relationships">
      <h3>Family relationships</h3>
      <p className="muted">Choose multiple existing people. You can select a person as both a son or daughter and an adopted child.</p>
      {(Object.keys(relationshipLabels) as RelationshipKind[]).map(kind => <RelationshipPicker key={kind} kind={kind}
        people={candidates} selected={selections[kind] ?? relatedIds(props.relationships, person?.id ?? '', kind)}
        onChange={ids=>{setSelections(current=>({...current,[kind]:ids}));changed();}}/>)}
    </section>
    {privateVisible&&<><h3>Personal details</h3><p className="muted small">Visible to this person’s verified account and family reviewers.</p><div className="form-grid">{publicProfileFields.map(field=><label key={field}>{labels[field]}<input type={field==='dob'?'date':field==='email'?'email':field==='map_url'?'url':'text'} value={profile[field]!==undefined?profile[field]||'':current.data?.[field]||''} onChange={e=>setProfile(p=>({...p,[field]:e.target.value||null}))}/></label>)}</div><label>Social links (JSON)<textarea value={social??JSON.stringify(current.data?.social_links||{},null,2)} onChange={e=>setSocial(e.target.value)} placeholder={'{"facebook":"https://facebook.com/..."}'}/></label></>}
    <label>Lineage fields (JSON)<textarea value={custom} onChange={e=>setCustom(e.target.value)}/></label><p className="muted small">Optional clan, gotra, branch or other lineage fields. These are visible to your family; keep contact details in Personal details.</p>
    <ActionStatus action={action}/><div className="button-row"><button className="secondary" type="button" onClick={close}>Cancel</button><button className="primary" disabled={action.busy}>{action.busy?'Saving…':props.role==='admin'?'Save verified record':'Submit for review'}</button></div>
  </form></Modal>;
}
