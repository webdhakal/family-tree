import { useEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { clearOfflineCopy, readOfflineCopy, saveOfflineCopy, snapshotEvent, snapshotKey } from '../offline';
import type { Family, Person } from '../lib';
import { ActionStatus, useAction } from './UI';

export function OfflineControls({ family, people, userId }: { family: Family; people: Person[]; userId: string }) {
  const action = useAction();
  const [copy, setCopy] = useState(readOfflineCopy);
  const [ready, setReady] = useState(() => !!navigator.serviceWorker?.controller);
  useEffect(() => {
    const update = () => setCopy(readOfflineCopy());
    const storage = (event: StorageEvent) => { if (event.key === snapshotKey || !event.key) update(); };
    const worker = () => setReady(!!navigator.serviceWorker?.controller);
    window.addEventListener(snapshotEvent, update);
    window.addEventListener('storage', storage);
    navigator.serviceWorker?.addEventListener('controllerchange', worker);
    worker();
    return () => {
      window.removeEventListener(snapshotEvent, update);
      window.removeEventListener('storage', storage);
      navigator.serviceWorker?.removeEventListener('controllerchange', worker);
    };
  }, []);
  const saved = copy?.ownerId === userId && copy.familyId === family.id;
  return <section className="panel offline-controls" aria-label="Offline access">
    <div><h2><WifiOff size={17}/> Offline access</h2>
      <p>Save names, gender and family links on this device for 24 hours. Anyone using this browser profile can open the copy.</p>
      {saved && <p role="status">Saved {new Date(copy.savedAt).toLocaleString()}.</p>}
      {copy && !saved && copy.ownerId === userId && <p>Saving this tree replaces the offline copy of {copy.familyName}.</p>}
      {!ready && <p>Offline saving is available after the installable app has loaded.</p>}
    </div>
    <div className="button-row">
      <button className="secondary" disabled={!ready || !people.length || action.busy} onClick={() => void action.run(async () => {
        saveOfflineCopy({ ownerId: userId, familyId: family.id, familyName: family.name, people });
      }, 'Family tree saved for offline viewing.')}><Download size={16}/> {saved ? 'Refresh offline copy' : 'Save for offline'}</button>
      {copy?.ownerId === userId && <button className="text-button" onClick={() => { clearOfflineCopy(); action.reset(); }}>Remove offline copy</button>}
    </div>
    <ActionStatus action={action}/>
  </section>;
}
