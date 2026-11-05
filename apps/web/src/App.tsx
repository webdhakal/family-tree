import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { Plus, ArrowRight, MailCheck } from 'lucide-react';
import { Auth, ConnectionSetup, PasswordRecovery } from './components/Auth';
import { Loading, ErrorBox, Mark, useAction, ActionStatus } from './components/UI';
const SystemPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.SystemPage })));
const Shell = lazy(() => import('./components/Shell').then(m => ({ default: m.Shell })));
import { supabase, connection, queryClient, selectRows, rpc, refresh, type Family } from './lib';
export default function App() {
  const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[recovery,setRecovery]=useState(false);
  const lastUser=useRef<string|null>(null);
  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    let active=true;
    void supabase.auth.getSession().then(({data})=>{if(active){setSession(data.session);setLoading(false);}});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{if(event==='SIGNED_OUT'||lastUser.current!==next?.user.id){queryClient.clear();}lastUser.current=next?.user.id||null;if(event==='PASSWORD_RECOVERY')setRecovery(true);setSession(next);setLoading(false);});
    return()=>{active=false;subscription.unsubscribe();};
  },[]);
  if(!connection.configured)return <ConnectionSetup/>;
  if(loading)return <Loading/>;
  if(recovery)return <PasswordRecovery done={()=>setRecovery(false)}/>;
  if(!session)return <Auth/>;
  return <Workspace key={session.user.id} session={session}/>;
}
function Workspace({session}:{session:Session}) {
  const userId=session.user.id;
  const [familyId,setFamilyId]=useState(()=>localStorage.getItem(`kinship.family.${userId}`)||'');
  const [showCreate,setShowCreate]=useState(false),[systemMode,setSystemMode]=useState(false);
  const families=useQuery({queryKey:['families',userId],queryFn:()=>selectRows<Family>('families')});
  const memberships=useQuery({queryKey:['my-roles',userId],queryFn:async()=>{const {data,error}=await supabase!.from('user_roles').select('*').eq('user_id',userId);if(error)throw error;return data as {family_id:string;role:'moderator'|'member'}[];}});
  const global=useQuery({queryKey:['global-admin',userId],queryFn:()=>rpc<boolean>('global_admin_status',{})});
  if(families.isPending||memberships.isPending)return <Loading/>;
  if(families.error||memberships.error)return <div className="setup-page"><div className="setup-card"><Mark/><h1>Finish database setup</h1><p>The application connected, but the family workspace could not load. Apply the migrations from this repository to your Supabase project.</p><ErrorBox error={families.error||memberships.error}/><button onClick={()=>void refresh()} className="primary">Try again</button><button className="text-button" onClick={()=>void supabase!.auth.signOut()}>Sign out</button></div></div>;
  const own=(families.data||[]).filter(f=>memberships.data?.some(r=>r.family_id===f.id));
  const family=own.find(f=>f.id===familyId)||own[0];
  function choose(id:string){setFamilyId(id);localStorage.setItem(`kinship.family.${userId}`,id);setShowCreate(false);}
  if(systemMode&&global.data)return <Suspense fallback={<Loading/>}><div className="system-standalone"><button className="secondary" onClick={()=>setSystemMode(false)}>Back to family workspace</button><SystemPage/></div></Suspense>;
  if(!family||showCreate)return <FamilyWelcome userId={userId} email={session.user.email||''} canCreate={!own.some(f=>f.created_by===userId)} close={family?()=>setShowCreate(false):undefined} complete={choose} system={global.data?()=>setSystemMode(true):undefined}/>;
  const role=family.admin_user_id===userId?'admin':memberships.data?.find(r=>r.family_id===family.id)?.role||'member';
  return <Suspense fallback={<Loading/>}><Shell key={`${family.id}:${role}`} family={family} families={own} role={role} user={session.user} selectFamily={choose} addFamily={()=>setShowCreate(true)} isSuper={global.data===true}/></Suspense>;
}
function FamilyWelcome({userId,email,canCreate,close,complete,system}:{userId:string;email:string;canCreate:boolean;close?:()=>void;complete:(id:string)=>void;system?:()=>void}) {
  const [name,setName]=useState(''),[token,setToken]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('invite')||'');const action=useAction();
  return <div className="welcome-page"><header className="welcome-header"><div className="brand"><Mark/><span>kinship.</span></div><div>{system&&<button className="secondary" onClick={system}>System administration</button>}<button className="text-button" onClick={()=>void supabase!.auth.signOut()}>Sign out</button></div></header><div className="welcome-intro"><span className="eyebrow">A PLACE FOR EVERY GENERATION</span><h1>Your family story<br/>starts with a connection.</h1><p>Welcome, {email}. Create your family’s private space or join one you’ve been invited to.</p></div><div className="welcome-options">
    {canCreate&&<section className="panel"><span className="round-icon"><Plus/></span><h2>Start a family tree</h2><p>Bring the generations together. You’ll be the family Admin and can invite others when you’re ready.</p><form onSubmit={e=>{e.preventDefault();void action.run(async()=>{const id=await rpc<string>('create_family',{p_name:name.trim()});await refresh();complete(id);});}}><label>Family name<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Dhakal Family"/></label><button className="primary" disabled={action.busy}>Create family <ArrowRight size={16}/></button></form></section>}
    <section className="panel"><span className="round-icon"><MailCheck/></span><h2>Join your family</h2><p>Paste the invitation token shared by your family Admin. Your confirmed account email must match the invitation.</p><form onSubmit={e=>{e.preventDefault();void action.run(async()=>{const id=await rpc<string>('accept_invitation',{p_token:token.trim()});history.replaceState(null,'',location.pathname);await refresh();complete(id);});}}><label>Invitation token<input required value={token} onChange={e=>setToken(e.target.value)} placeholder="Paste your invitation token"/></label><button className="secondary" disabled={action.busy}>Join family <ArrowRight size={16}/></button></form></section>
  </div><div className="welcome-status"><ActionStatus action={action}/>{close&&<button className="text-button" onClick={close}>Back to my family</button>}<span className="muted small">Account {userId.slice(0,8)} · Your family records are private.</span></div></div>;
}
