import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { Network, Users, ClipboardCheck, Upload, Settings, LogOut, Plus, ChevronDown, ShieldCheck, Menu, X } from 'lucide-react';
import { Mark, initials } from './UI';
import { db, listFamilyPeople, type Family, type Person, type Role } from '../lib';
import { clearOfflineCopy } from '../offline';
import { Tree } from '../pages/Tree';
import { Members } from '../pages/Members';
import { Review } from '../pages/Review';
import { Import } from '../pages/Import';
import { SettingsPage, SystemPage } from '../pages/Settings';
export type WorkspaceProps={family:Family;role:Role;user:User;people:Person[]};
export function Shell({family,families,role,user,selectFamily,addFamily,isSuper}:{family:Family;families:Family[];role:Role;user:User;selectFamily:(id:string)=>void;addFamily:()=>void;isSuper:boolean}) {
  const [page,setPage]=useState('tree'),[open,setOpen]=useState(false);
  const members=useQuery({queryKey:['members',family.id],queryFn:()=>listFamilyPeople(family.id)});
  const pending=useQuery({queryKey:['pending',family.id],queryFn:async()=>{const {count,error}=await db().from('pending_changes').select('id',{count:'exact',head:true}).eq('family_id',family.id).eq('status','pending');if(error)throw error;return count||0;}});
  const nav=[{id:'tree',label:'Family tree',icon:Network},{id:'members',label:'People',icon:Users},{id:'review',label:role==='member'?'My requests':'Review queue',icon:ClipboardCheck},...(role==='admin'?[{id:'import',label:'Import records',icon:Upload},{id:'settings',label:'Family settings',icon:Settings}]:[]),...(isSuper?[{id:'system',label:'System administration',icon:ShieldCheck}]:[])];
  const active=nav.find(n=>n.id===page)?page:'tree'; const props={family,role,user,people:members.data||[]};
  return <div className="app-shell"><button className="mobile-menu icon-button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="family-navigation" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button>
    {open && <button className="mobile-scrim" aria-label="Close family navigation" onClick={()=>setOpen(false)}/>}
    <aside id="family-navigation" className={`sidebar ${open?'open':''}`}><a href="#" className="brand" onClick={e=>{e.preventDefault();setPage('tree');}}><Mark/><span>kinship<span className="brand-dot">.</span></span></a>
      <div className="family-selector"><label htmlFor="family-switch">FAMILY WORKSPACE</label><div><span className="family-avatar">{initials(family.name)}</span><select id="family-switch" aria-label="Select family" value={family.id} onChange={e=>selectFamily(e.target.value)}>{families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><ChevronDown size={15}/></div><span className="role-label">{role==='admin'?'Family Admin':role==='moderator'?'Moderator':'Member'}</span></div>
      <nav aria-label="Main navigation">{nav.map(n=><button key={n.id} className={active===n.id?'active':''} aria-current={active===n.id?'page':undefined} onClick={()=>{setPage(n.id);setOpen(false);}}><n.icon size={19}/>{n.label}{n.id==='review'&&!!pending.data&&<span className="nav-count">{pending.data}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={19}/><div><strong>Your private family space</strong><p>Only invited family members can see your tree.</p></div></div><button className="sidebar-action" onClick={addFamily}><Plus size={17}/> Join another family</button><div className="account"><span className="account-avatar">{initials(user.email||'Member')}</span><div><strong>{user.email?.split('@')[0]||'Member'}</strong><span>{user.email}</span></div><button aria-label="Sign out" className="icon-button" onClick={()=>{clearOfflineCopy();void db().auth.signOut();}}><LogOut size={18}/></button></div></div>
    </aside><main className="main"><header className="topbar"><span>{family.name} <span className="crumb">/</span> {nav.find(n=>n.id===active)?.label}</span><span className="private-badge"><ShieldCheck size={14}/> Private workspace</span></header>
      {active==='tree'&&<Tree {...props} error={members.error} loading={members.isPending}/>}{active==='members'&&<Members {...props}/>}{active==='review'&&<Review {...props}/>}{active==='import'&&role==='admin'&&<Import {...props}/>}{active==='settings'&&role==='admin'&&<SettingsPage {...props}/>}{active==='system'&&isSuper&&<SystemPage/>}
    </main></div>;
}
