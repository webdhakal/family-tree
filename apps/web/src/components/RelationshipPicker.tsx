import { useState } from 'react';
import { relationshipLabels, type RelationshipKind } from '@family-tree/core/relationships';
import type { Person } from '../lib';

export function RelationshipPicker({ kind, people, selected, onChange }: {
  kind: RelationshipKind;
  people: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const matches = people.filter(person => person.full_name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const label = relationshipLabels[kind];
  return <details className="relationship-picker">
    <summary>{label} <span>{selected.length} selected</span></summary>
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <label>Find a person<input type="search" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <div className="relationship-options">
        {matches.map(person => <label key={person.id}>
          <input type="checkbox" checked={selected.includes(person.id)} disabled={selected.length >= 100 && !selected.includes(person.id)}
            onChange={event => onChange(event.target.checked ? [...selected, person.id] : selected.filter(id => id !== person.id))}/>
          <span>{person.full_name} <small>· {person.id.slice(0, 8)}</small></span>
        </label>)}
        {!matches.length && <p>No people match this search.</p>}
      </div>
    </fieldset>
  </details>;
}
