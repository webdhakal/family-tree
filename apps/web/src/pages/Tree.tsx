import { useState } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import type { Person } from '../lib';
import type { WorkspaceProps } from '../components/Shell';
import { ErrorBox, Loading } from '../components/UI';
import { PersonEditor } from '../components/PersonEditor';
import { TreeExplorer } from '../components/TreeExplorer';
import { OfflineControls } from '../components/OfflineControls';
import { PersonDetails } from './Members';

export function Tree(props: WorkspaceProps & { error: unknown; loading: boolean }) {
  const [focus, setFocus] = useState('');
  const [branchKey, setBranchKey] = useState(0);
  const [add, setAdd] = useState(false);
  const [details, setDetails] = useState<Person | null>(null);
  const me = props.people.find(person => person.linked_user_id === props.user.id);
  const selected = props.people.find(person => person.id === focus) ?? me ?? props.people[0];
  return <div className="page-body tree-page">
    <div className="page-heading">
      <div>
        <span className="eyebrow"><GitBranch size={14} aria-hidden="true"/> Family explorer</span>
        <h1>Family tree</h1>
        <p>{props.people.length} {props.people.length === 1 ? 'person' : 'people'}</p>
      </div>
      <button className="primary" disabled={props.loading || !!props.error} onClick={() => setAdd(true)}><Plus size={17}/> Add a person</button>
    </div>
    <ErrorBox error={props.error}/>
    {props.loading ? <Loading/> : props.error ? null : <TreeExplorer
      key={branchKey} people={props.people} relationships={props.relationships} focus={selected?.id} onFocus={setFocus} onPerson={setDetails}
      emptyAction={<button className="primary" onClick={() => setAdd(true)}>Add the first person</button>}
    />}
    {!props.loading && !props.error && <OfflineControls family={props.family} people={props.people} relationships={props.relationships} userId={props.user.id}/>}
    {add && <PersonEditor {...props} close={() => setAdd(false)}/>}
    {details && <PersonDetails {...props} person={details} close={() => setDetails(null)}
      focus={id => { setFocus(id); setBranchKey(key => key + 1); setDetails(null); }}/>}
  </div>;
}
