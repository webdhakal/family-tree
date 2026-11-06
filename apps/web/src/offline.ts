import { connection } from './lib';
import type { DiagramPerson } from './components/TreeExplorer';

const lifetime = 24 * 60 * 60 * 1000;
export const snapshotKey = `kinship.offline.v1:${connection.url}`;
export const snapshotEvent = 'kinship-offline-copy-changed';

export type OfflineCopy = {
  ownerId: string;
  familyId: string;
  familyName: string;
  savedAt: number;
  expiresAt: number;
  people: DiagramPerson[];
};

export function readOfflineCopy(): OfflineCopy | null {
  try {
    const copy = JSON.parse(localStorage.getItem(snapshotKey) ?? 'null') as OfflineCopy | null;
    if (!copy) return null;
    if (!Array.isArray(copy.people) || !(copy.expiresAt > Date.now())) {
      localStorage.removeItem(snapshotKey);
      return null;
    }
    return copy;
  } catch {
    return null;
  }
}

export function clearOfflineCopy() {
  try { localStorage.removeItem(snapshotKey); } catch { /* Storage may be disabled. */ }
  window.dispatchEvent(new Event(snapshotEvent));
}

export function saveOfflineCopy(input: Omit<OfflineCopy, 'savedAt' | 'expiresAt'>) {
  const savedAt = Date.now();
  // Persist only diagram fields. No profile details, account links, or query data.
  const people = input.people.map(({ id, full_name, father_id, mother_id, gender }) =>
    ({ id, full_name, father_id, mother_id, gender: gender ?? null }));
  localStorage.setItem(snapshotKey, JSON.stringify({ ...input, people, savedAt, expiresAt: savedAt + lifetime }));
  window.dispatchEvent(new Event(snapshotEvent));
}
