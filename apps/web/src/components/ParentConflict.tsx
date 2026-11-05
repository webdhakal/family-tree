import { useId } from 'react';
import { useParentConflict, type ParentConflictProps } from '@family-tree/core/useParentConflict';
export function ParentConflict(props: Omit<ParentConflictProps, 'newKey'>) {
  return <Picker key={`${props.familyId}:${props.member.id}:${props.member.version}:${props.name}:${props.kind}`}
    {...props} newKey={() => crypto.randomUUID()} />;
}
function Picker(props: ParentConflictProps) {
  const id = useId();
  const { selected, select, candidates, mutation } = useParentConflict(props);
  return <form className="space-y-4 rounded-xl border p-4" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
    <fieldset disabled={mutation.isPending || mutation.isSuccess} className="space-y-3">
      <legend className="font-semibold">Choose {props.member.full_name}'s {props.kind}</legend>
      <p>Matching name: {props.name}. A reviewer must verify your selection.</p>
      {candidates.isPending && <p role="status">Loading candidates…</p>}
      {candidates.isError && <p role="alert">{candidates.error.message}</p>}
      {candidates.data?.map(candidate => <label key={candidate.id} className="block rounded border p-3">
        <input type="radio" name={id} value={candidate.id} checked={selected === candidate.id}
          onChange={() => select(candidate.id)} />{' '}{candidate.full_name}
        <span className="block text-sm">Node {candidate.id}</span>
        <span className="block text-sm">Father node: {candidate.father_id || 'Unknown'}; Mother node: {candidate.mother_id || 'Unknown'}</span>
      </label>)}
      {candidates.data?.length === 0 && <p>No eligible match. Ask a reviewer to add or identify the parent.</p>}
      <button className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        disabled={!selected || candidates.isFetching} type="submit">{mutation.isPending ? 'Submitting…' : 'Submit for verification'}</button>
    </fieldset>
    {mutation.isError && <p role="alert">{mutation.error.message}</p>}
    {mutation.isSuccess && <p role="status">Submitted. The tree will update after approval.</p>}
  </form>;
}
