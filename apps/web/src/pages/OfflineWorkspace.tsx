import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { clearOfflineCopy, readOfflineCopy, snapshotKey } from '../offline';
import { genderOptions } from '@family-tree/core/gender';
import { TreeExplorer, type DiagramPerson } from '../components/TreeExplorer';
import { Empty, Modal } from '../components/UI';

export default function OfflineWorkspace() {
  const [copy, setCopy] = useState(readOfflineCopy);
  const [focus, setFocus] = useState('');
  const [person, setPerson] = useState<DiagramPerson | null>(null);
  useEffect(() => {
    const update = () => { setCopy(readOfflineCopy()); setPerson(null); };
    const storage = (event: StorageEvent) => { if (event.key === snapshotKey || !event.key) update(); };
    window.addEventListener('storage', storage);
    const timer = copy ? window.setTimeout(update, Math.max(0, copy.expiresAt - Date.now())) : undefined;
    return () => {
      window.removeEventListener('storage', storage);
      window.clearTimeout(timer);
    };
  }, [copy]);
  return <main className="page-body offline-workspace">
    <div className="page-heading"><div>
      <span className="eyebrow"><WifiOff size={16}/> OFFLINE · READ ONLY</span>
      <h1>{copy?.familyName ?? 'You’re offline'}</h1>
      {copy && <p>Saved {new Date(copy.savedAt).toLocaleString()}. Reconnect to make changes.</p>}
    </div>
    <div className="button-row">
      <button className="secondary" onClick={() => location.reload()}>Reconnect</button>
      {copy && <button className="text-button" onClick={() => { clearOfflineCopy(); setCopy(null); setPerson(null); }}>Remove offline copy</button>}
    </div>
    </div>
    {copy ? <TreeExplorer people={copy.people} relationships={copy.relationships} focus={focus || copy.people[0]?.id} onFocus={setFocus} onPerson={setPerson}/>
      : <Empty title="No saved family tree"><p>Reconnect and save a family tree for offline viewing.</p></Empty>}
    {person && copy && <Modal title={person.full_name} close={() => setPerson(null)}>
      <dl className="detail-list">
        <div><dt>Gender</dt><dd>{person.gender ? genderOptions[person.gender] : 'Not recorded'}</dd></div>
        <div><dt>Father</dt><dd>{copy.people.find(record => record.id === person.father_id)?.full_name ?? 'Unknown'}</dd></div>
        <div><dt>Mother</dt><dd>{copy.people.find(record => record.id === person.mother_id)?.full_name ?? 'Unknown'}</dd></div>
      </dl>
    </Modal>}
  </main>;
}
