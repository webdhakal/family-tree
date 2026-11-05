import { useState } from 'react';
import { ArrowRight, ShieldCheck, GitBranch, Users, KeyRound } from 'lucide-react';
import { db, connection, configError } from '../lib';
import { parseSupabaseConfig } from '@family-tree/core/config';
import { Mark, useAction, ActionStatus } from './UI';
export function ConnectionSetup() {
  const [url, setUrl] = useState(''), [key, setKey] = useState(''); const action = useAction();
  return <div className="setup-page"><div className="setup-card"><Mark/><span className="eyebrow">WORKSPACE SETUP</span><h1>A home for your<br/>family connections.</h1>
    <p>Connect this application to your Supabase project to get started. Your family records stay in your own project.</p>
    {configError && <p className="error">{configError}</p>}
    <form onSubmit={e => {e.preventDefault(); void action.run(async () => { const c = parseSupabaseConfig(url,key); if (!c.configured) throw new Error('Enter both connection fields.'); localStorage.setItem('kinship.connection',JSON.stringify(c)); location.reload(); });}}>
      <label>Project URL<input required type="url" placeholder="https://your-project.supabase.co" value={url} onChange={e=>setUrl(e.target.value)}/></label>
      <label>Publishable key<input required placeholder="sb_publishable_…" value={key} onChange={e=>setKey(e.target.value)}/></label>
      <p className="muted small">Find these in Supabase → Project settings → API keys. Use the publishable key, never a secret key.</p>
      <ActionStatus action={action}/><button className="primary" disabled={action.busy}>Connect project <ArrowRight size={17}/></button>
    </form>
  </div></div>;
}
export function Auth() {
  const [mode,setMode]=useState<'signin'|'signup'|'recover'>('signin'); const [email,setEmail]=useState(''),[password,setPassword]=useState(''); const action=useAction();
  async function submit() {
    if(mode==='recover') { const {error}=await db().auth.resetPasswordForEmail(email,{redirectTo:location.origin}); if(error)throw error; return; }
    const result=mode==='signup'?await db().auth.signUp({email,password,options:{emailRedirectTo:location.origin}}):await db().auth.signInWithPassword({email,password}); if(result.error)throw result.error;
  }
  return <div className="auth-page"><section className="auth-story"><div className="brand"><Mark/><span>kinship<span className="brand-dot">.</span></span></div>
    <div className="auth-headline"><span className="eyebrow">EVERY CONNECTION HAS A STORY</span><h1>Your people.<br/>Your roots.<br/><em>One family.</em></h1><p>A private space to connect generations, preserve your lineage, and keep your family’s story growing.</p></div>
    <div className="lineage-illustration" aria-hidden="true"><div className="lineage-row"><span>Grandparents</span></div><i/><div className="lineage-row"><span>Parents</span><span>Parents</span></div><i/><div className="lineage-row"><span className="you">Your generation</span></div></div>
    <p className="auth-foot"><ShieldCheck size={16}/> Private by design. Connected across generations.</p>
  </section><section className="auth-form"><div><span className="eyebrow">YOUR FAMILY WORKSPACE</span><h2>{mode==='signin'?'Welcome back':mode==='signup'?'Start your family story':'Reset your password'}</h2><p>{mode==='signin'?'Sign in to reconnect with your family.':mode==='signup'?'Create an account, then start or join a family.':'We’ll send a recovery link to your email.'}</p>
    <form onSubmit={e=>{e.preventDefault();void action.run(submit,mode==='signup'?'Check your email to confirm your account.':mode==='recover'?'Check your email for the recovery link.':'');}}>
      <label>Email address<input type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      {mode!=='recover'&&<label>Password<input type="password" minLength={8} autoComplete={mode==='signup'?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)}/></label>}
      <ActionStatus action={action}/><button className="primary" disabled={action.busy}>{action.busy?'Please wait…':mode==='signin'?'Sign in':mode==='signup'?'Create account':'Send recovery link'}<ArrowRight size={17}/></button>
    </form>
    {mode==='signin'&&<button className="text-button" onClick={()=>{setMode('recover');action.reset();}}>Forgot password?</button>}
    <div className="divider">or</div><button className="secondary full" disabled={action.busy} onClick={()=>void action.run(async()=>{const {error}=await db().auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin}});if(error)throw error;})}>Continue with Google</button>
    <p className="switch-auth">{mode==='signin'?'New to Kinship?':'Already have an account?'} <button className="text-button" onClick={()=>{setMode(mode==='signin'?'signup':'signin');action.reset();}}>{mode==='signin'?'Create an account':'Sign in'}</button></p>
    <div className="auth-benefits"><span><GitBranch size={16}/> All generations</span><span><Users size={16}/> One family space</span><span><KeyRound size={16}/> Verified changes</span></div>
    <p className="muted small">Email delivery and Google sign-in must be enabled for this project.</p>
  </div></section></div>;
}
export function PasswordRecovery({ done }: { done: () => void }) {
  const [password,setPassword]=useState('');const action=useAction();
  return <div className="setup-page"><div className="setup-card"><Mark/><h1>Choose a new password</h1><form onSubmit={e=>{e.preventDefault();void action.run(async()=>{const {error}=await db().auth.updateUser({password});if(error)throw error;done();});}}><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><ActionStatus action={action}/><button className="primary" disabled={action.busy}>Save password</button></form></div></div>;
}
export { connection };
