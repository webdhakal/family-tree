import { useMemo, useState } from 'react';
import { genderOptions, type Gender } from '@family-tree/core/gender';
import { relatedIds, relationshipLabels, type RelationshipKind } from '@family-tree/core/relationships';
import { useQuery } from '@tanstack/react-query';
import { Check, X, GitBranch, Clock, ShieldCheck } from 'lucide-react';
import type { WorkspaceProps } from '../components/Shell';
import { api, db, rpc, refresh, type Person } from '../lib';
import { Empty, Loading, ErrorBox, useAction, ActionStatus, Modal } from '../components/UI';
import { ParentConflict } from '../components/ParentConflict';
type Change={id:string;member_id:string|null;kind:string;patch:Record<string,unknown>;base_version:number|null;submitted_by:string;status:string;created_at:string;review_note:string|null};
type Issue={id:string;member_id:string;parent_kind:'father'|'mother';raw_name:string;resolved_at:string|null};
const fieldNames: Record<string, string> = {
  full_name: 'Name', father_id: 'Father', mother_id: 'Mother',
  dob: 'Date of birth', map_url: 'Map link', street_address: 'Street address',
  original_address: 'Ancestral origin', address: 'Current location',
};

function formatValue(key: string, value: unknown, names: Map<string, string>): string {
  if (value == null || value === '') return 'Not recorded';
  if (key === 'gender' && typeof value === 'string') return genderOptions[value as Gender] ?? value;
  if (key === 'father_id' || key === 'mother_id') return names.get(String(value)) ?? 'Unknown person';
  if (typeof value === 'object') return Object.entries(value).map(([label, item]) => `${label}: ${String(item)}`).join(', ') || 'None';
  return String(value);
}

function ChangedFields({ change, target, names, relationships }: {
  change: Change; target?: Person; names: Map<string, string>; relationships: WorkspaceProps['relationships'];
}) {
  const rows = Object.entries(change.patch).flatMap(([key, value]) => {
    if (key === 'relationships' && value && typeof value === 'object') {
      return Object.entries(value).map(([kind, ids]) => ({
        label: relationshipLabels[kind as RelationshipKind] ?? kind,
        before: target ? relatedIds(relationships, target.id, kind as RelationshipKind).map(id => names.get(id) ?? 'Unknown person').join(', ') : '',
        after: Array.isArray(ids) ? ids.map(id => names.get(String(id)) ?? 'Unknown person').join(', ') || 'None selected' : 'Not recorded',
      }));
    }
    if (key === 'profile' && value && typeof value === 'object') {
      return Object.entries(value).map(([field, item]) => ({
        label: fieldNames[field] ?? field.replaceAll('_', ' '), before: '', after: formatValue(field, item, names),
      }));
    }
    return [{ label: fieldNames[key] ?? key.replaceAll('_', ' '),
      before: target ? formatValue(key, target[key as keyof Person], names) : '',
      after: formatValue(key, value, names) }];
  });
  if (change.kind === 'claim') return <p className="request-claim">Connect this record to the account that requested it.</p>;
  return <dl className="request-fields">{rows.map(({ label, before, after }, index) =>
    <div key={`${label}-${index}`}>
      <dt>{label}</dt><dd>{after}</dd>
      {change.status === 'pending' && before && before !== after && <small>Current: {before}</small>}
    </div>)}</dl>;
}

export function Review(props:WorkspaceProps){
  const [tab,setTab]=useState('pending'),[conflict,setConflict]=useState<Issue|null>(null),[note,setNote]=useState(''),[page,setPage]=useState(0);const action=useAction();
  const changes=useQuery({queryKey:['pending',props.family.id,'list',tab,page],queryFn:async()=>{let q=db().from('pending_changes').select('*').eq('family_id',props.family.id);q=tab==='history'?q.neq('status','pending'):q.eq('status','pending');const {data,error}=await q.order('created_at',{ascending:false}).range(page*50,page*50+49);if(error)throw error;return data as Change[];}});
  const issues=useQuery({queryKey:['issues',props.family.id],queryFn:async()=>{const {data,error}=await db().from('import_issues').select('*').eq('family_id',props.family.id).is('resolved_at',null).limit(100);if(error)throw error;return data as Issue[];}});
  const names=useMemo(()=>new Map(props.people.map(person=>[person.id,person.full_name])),[props.people]);
  const visible=changes.data?.filter(c=>tab==='pending'?c.status==='pending':c.status!=='pending')||[];
  const selectedPerson=conflict?props.people.find(p=>p.id===conflict.member_id):undefined;
  return <div className="page-body"><div className="page-heading"><div><span className="eyebrow">Family updates</span><h1>{props.role==='member'?'My requests':'Review queue'}</h1><p>{props.role==='member'?'Track your suggestions and help resolve missing connections.':'Verify suggested records and connections before they become part of the tree.'}</p></div><span className="badge"><ShieldCheck size={15}/> {props.role==='member'?'Member submissions':'Verified changes only'}</span></div>
    <div className="toolbar"><div className="segmented"><button aria-pressed={tab==='pending'} className={tab==='pending'?'selected':''} onClick={()=>{setTab('pending');setPage(0);}}>Pending</button><button aria-pressed={tab==='history'} className={tab==='history'?'selected':''} onClick={()=>{setTab('history');setPage(0);}}>History</button><button aria-pressed={tab==='issues'} className={tab==='issues'?'selected':''} onClick={()=>{setTab('issues');setPage(0);}}>Missing connections {issues.data?.length?`(${issues.data.length})`:''}</button></div></div><ActionStatus action={action}/>
    {tab==='issues'?<><ErrorBox error={issues.error}/>{issues.isPending?<Loading/>:!issues.data?.length?<Empty title="No missing connections"><p>Ambiguous parent names from imports will appear here.</p></Empty>:issues.data.map(i=><article key={i.id} className="panel request-card"><div className="request-heading"><span className="round-icon"><GitBranch/></span><div><h3>{props.people.find(p=>p.id===i.member_id)?.full_name||'Family record'}</h3><p>Help identify their {i.parent_kind}: <strong>{i.raw_name}</strong></p></div><button className="secondary" onClick={()=>setConflict(i)}>Suggest a connection</button></div></article>)}</>:<><ErrorBox error={changes.error}/>{changes.isPending?<Loading/>:!visible.length?<Empty title={tab==='pending'?'All caught up':'No reviewed requests yet'}><p>{tab==='pending'?'New suggestions will appear here for verification.':'Approved and rejected suggestions will appear here.'}</p></Empty>:visible.map(c=>{
      const target=props.people.find(p=>p.id===c.member_id);const self=c.submitted_by===props.user.id;const canReview=props.role==='admin'||props.role==='moderator'&&!self;
      return <article className="panel request-card" key={c.id}><div className="request-heading"><span className="round-icon"><Clock/></span><div><h3>{c.kind==='create'?String(c.patch.full_name||'New person'):target?.full_name||'Family record'}</h3><p>{c.kind==='claim'?'Identity claim':c.kind==='link'?'Parent connection suggestion':c.kind==='create'?'New family record':'Profile changes'} · {new Date(c.created_at).toLocaleDateString()}</p></div><span className={`badge status-${c.status}`}>{c.status}</span></div><ChangedFields change={c} target={target} names={names} relationships={props.relationships}/><p className="muted small">Submitted by {self?'you':c.submitted_by}</p>
      {c.status==='pending'&&canReview&&<div className="review-actions"><input aria-label="Reviewer note" placeholder="Verification note (optional)" value={note} onChange={e=>setNote(e.target.value)}/><button className="secondary" disabled={action.busy} onClick={()=>void action.run(async()=>{await rpc('review_change',{p_change:c.id,p_approve:false,p_note:note});await refresh();setNote('');},'Request rejected.')}><X size={16}/> Reject</button><button className="primary" disabled={action.busy} onClick={()=>void action.run(async()=>{await rpc('review_change',{p_change:c.id,p_approve:true,p_note:note});await refresh();setNote('');},'Verified changes applied.')}><Check size={16}/> Verify & approve</button></div>}
      {c.status==='pending'&&props.role==='moderator'&&self&&<p className="muted">Another reviewer must verify your own suggestion.</p>}{c.review_note&&<p>Review note: {c.review_note}</p>}</article>;
    })}</>}
    {tab!=='issues'&&<div className="button-row"><button className="secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous page</button><span>Page {page+1}</span><button className="secondary" disabled={(changes.data?.length||0)<50} onClick={()=>setPage(p=>p+1)}>Next page</button></div>}
    {conflict&&selectedPerson&&<Modal title="Resolve parent connection" close={()=>setConflict(null)}><ParentConflict api={api!} familyId={props.family.id} member={selectedPerson} name={conflict.raw_name} kind={conflict.parent_kind}/></Modal>}
  </div>;
}
