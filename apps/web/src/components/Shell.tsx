import { useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Relationship } from '@family-tree/core/relationships';
import type { User } from '@supabase/supabase-js';
import {
  ChevronDown, ChevronRight, ClipboardCheck, Ellipsis, LogOut, Network,
  Plus, Settings, ShieldCheck, Upload, Users, X, type LucideIcon,
} from 'lucide-react';
import { ErrorBox, Loading, Mark, initials } from './UI';
import { db, listFamilyPeople, listFamilyRelationships, type Family, type Person, type Role } from '../lib';
import { clearOfflineCopy } from '../offline';
import { Tree } from '../pages/Tree';
import { Members } from '../pages/Members';
import { Review } from '../pages/Review';
import { Import } from '../pages/Import';
import { SettingsPage, SystemPage } from '../pages/Settings';

export type WorkspaceProps = {
  family: Family;
  role: Role;
  user: User;
  people: Person[];
  relationships: Relationship[];
};

type Page = 'tree' | 'members' | 'review' | 'import' | 'settings' | 'system';
type NavigationItem = { id: Page; label: string; mobileLabel?: string; icon: LucideIcon };
type ShellProps = Pick<WorkspaceProps, 'family' | 'role' | 'user'> & {
  families: Family[];
  selectFamily: (id: string) => void;
  addFamily: () => void;
  isSuper: boolean;
};

function FamilySwitcher({ family, families, role, selectFamily }: Pick<ShellProps, 'family' | 'families' | 'role' | 'selectFamily'>) {
  const id = useId();
  return <div className="family-selector">
    <label htmlFor={id}>Your workspace</label>
    <div>
      <span className="family-avatar" aria-hidden="true">{initials(family.name)}</span>
      <select id={id} aria-label="Select family" value={family.id} onChange={event => selectFamily(event.target.value)}>
        {families.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <ChevronDown size={16} aria-hidden="true"/>
    </div>
    <span className="role-label">{role === 'admin' ? 'Family admin' : role === 'moderator' ? 'Moderator' : 'Member'}</span>
  </div>;
}

export function Shell({ family, families, role, user, selectFamily, addFamily, isSuper }: ShellProps) {
  const [page, setPage] = useState<Page>('tree');
  const main = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const members = useQuery({ queryKey: ['members', family.id], queryFn: () => listFamilyPeople(family.id) });
  const relationships = useQuery({ queryKey: ['relationships', family.id], queryFn: () => listFamilyRelationships(family.id) });
  const pending = useQuery({
    queryKey: ['pending', family.id],
    queryFn: async () => {
      const { count, error } = await db().from('pending_changes')
        .select('id', { count: 'exact', head: true }).eq('family_id', family.id).eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
  });
  const explore: NavigationItem[] = [
    { id: 'tree', label: 'Family tree', mobileLabel: 'Tree', icon: Network },
    { id: 'members', label: 'People', icon: Users },
    { id: 'review', label: role === 'member' ? 'My requests' : 'Review queue',
      mobileLabel: role === 'member' ? 'Requests' : 'Review', icon: ClipboardCheck },
  ];
  const manage: NavigationItem[] = [];
  if (role === 'admin') manage.push(
    { id: 'import', label: 'Import records', icon: Upload },
    { id: 'settings', label: 'Family settings', icon: Settings },
  );
  if (isSuper) manage.push({ id: 'system', label: 'System administration', icon: ShieldCheck });
  const current = [...explore, ...manage].find(item => item.id === page) ?? explore[0];
  const active = current.id;
  const props = { family, role, user, people: members.data ?? [], relationships: relationships.data ?? [] };
  const familyLoading = members.isPending || relationships.isPending;
  const familyError = members.error || relationships.error;

  function navigate(next: Page) {
    menu.current?.close();
    if (next === active) return;
    setPage(next);
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      main.current?.focus({ preventScroll: true });
    });
  }

  function navButton(item: NavigationItem, mobile = false) {
    return <button key={item.id} type="button" className={active === item.id ? 'active' : ''}
      aria-current={active === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
      <item.icon size={mobile ? 21 : 18} aria-hidden="true"/>
      <span>{mobile ? item.mobileLabel ?? item.label : item.label}</span>
      {item.id === 'review' && !!pending.data && <span className="nav-count">{pending.data}</span>}
    </button>;
  }

  function join() {
    menu.current?.close();
    addFamily();
  }

  function signOut() {
    menu.current?.close();
    clearOfflineCopy();
    void db().auth.signOut();
  }

  const account = <div className="account">
    <span className="account-avatar" aria-hidden="true">{initials(user.email || 'Member')}</span>
    <div><strong>Your account</strong><span>{user.email}</span></div>
    <button type="button" className="icon-button" aria-label="Sign out" title="Sign out" onClick={signOut}>
      <LogOut size={18} aria-hidden="true"/>
    </button>
  </div>;

  return <div className="app-shell">
    <a href="#workspace-content" className="skip-workspace">Skip to content</a>
    <aside className="sidebar workspace-sidebar" aria-label="Family workspace">
      <button type="button" className="brand" onClick={() => navigate('tree')}>
        <Mark/><span>kinship<span className="brand-dot">.</span></span>
      </button>
      <FamilySwitcher family={family} families={families} role={role} selectFamily={selectFamily}/>
      <nav aria-label="Main navigation">
        <div className="nav-group"><p>Explore</p>{explore.map(item => navButton(item))}</div>
        {!!manage.length && <div className="nav-group"><p>Manage</p>{manage.map(item => navButton(item))}</div>}
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="sidebar-action" onClick={join}><Plus size={17} aria-hidden="true"/> Join another family</button>
        {account}
      </div>
    </aside>
    <main id="workspace-content" tabIndex={-1} ref={main} className="main">
      <header className="topbar workspace-topbar">
        <div className="workspace-path">
          <span className="mobile-brand"><Mark/></span>
          <strong>{family.name}</strong>
          <ChevronRight size={14} aria-hidden="true"/>
          <span>{current.label}</span>
        </div>
        <span className="private-badge"><ShieldCheck size={16} aria-hidden="true"/> Private workspace</span>
      </header>
      {active === 'tree' && <Tree {...props} error={familyError} loading={familyLoading}/>}
      {active === 'members' && (familyLoading ? <Loading/> : familyError ? <ErrorBox error={familyError}/> : <Members {...props}/>)}
      {active === 'review' && <Review {...props}/>}
      {active === 'import' && role === 'admin' && <Import {...props}/>}
      {active === 'settings' && role === 'admin' && <SettingsPage {...props}/>}
      {active === 'system' && isSuper && <SystemPage/>}
    </main>
    <nav className="workspace-mobile-nav" aria-label="Mobile navigation">
      {explore.map(item => navButton(item, true))}
      <button type="button" aria-haspopup="dialog" className={manage.some(item => item.id === active) ? 'active' : ''}
        onClick={() => menu.current?.showModal()}>
        <Ellipsis size={22} aria-hidden="true"/><span>More</span>
      </button>
    </nav>
    <dialog ref={menu} className="workspace-menu" aria-labelledby="workspace-menu-title"
      onClick={event => { if (event.target === event.currentTarget) menu.current?.close(); }}>
      <div className="workspace-menu-body">
        <header>
          <h2 id="workspace-menu-title">Family workspace</h2>
          <button type="button" className="icon-button" aria-label="Close menu" onClick={() => menu.current?.close()}>
            <X size={21} aria-hidden="true"/>
          </button>
        </header>
        <FamilySwitcher family={family} families={families} role={role} selectFamily={id => {
          menu.current?.close();
          selectFamily(id);
        }}/>
        {!!manage.length && <nav className="nav-group" aria-label="Manage family">{manage.map(item => navButton(item))}</nav>}
        <button type="button" className="sidebar-action" onClick={join}><Plus size={17} aria-hidden="true"/> Join another family</button>
        {account}
      </div>
    </dialog>
  </div>;
}
