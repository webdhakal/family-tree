import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ReactFlow, Background, Controls, Position, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { List, Network, Search, X } from 'lucide-react';
import { familyBranch, indexFamily, searchFamily, type TreeRecord } from '@family-tree/core/generations';
import { layoutMembers, NODE_WIDTH, NODE_HEIGHT } from '@family-tree/core/layout';
import { genderOptions, type Gender } from '@family-tree/core/gender';
import { Empty, initials } from './UI';

export type DiagramPerson = TreeRecord & { gender: Gender | null };

function FitDiagram({ layoutKey }: { layoutKey: unknown }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => void fitView({ padding: 0.2, maxZoom: 1.15 }));
    return () => cancelAnimationFrame(frame);
  }, [fitView, layoutKey]);
  return null;
}

export function TreeExplorer<T extends DiagramPerson>({
  people, focus, onFocus, onPerson, emptyAction,
}: {
  people: T[];
  focus?: string;
  onFocus: (id: string) => void;
  onPerson: (person: T) => void;
  emptyAction?: ReactNode;
}) {
  const [name, setName] = useState('');
  const [generation, setGeneration] = useState('');
  const [direction, setDirection] = useState<'ancestors' | 'descendants'>('ancestors');
  const [depth, setDepth] = useState(4);
  const [list, setList] = useState(false);
  const term = useDeferredValue(name);
  const indexed = useMemo(() => indexFamily(people), [people]);
  const levels = useMemo(() => [...new Set(indexed.generations.values())].sort((a, b) => a - b), [indexed]);
  const searching = !!term.trim() || !!generation;
  const result = useMemo(() => {
    if (searching) return searchFamily(indexed, term, generation ? Number(generation) : undefined);
    const branch = focus ? familyBranch(indexed, focus, direction, depth) : [];
    return { matches: branch, diagram: branch };
  }, [indexed, searching, term, generation, focus, direction, depth]);
  const layout = useMemo(() => list ? null : layoutMembers(result.diagram), [list, result.diagram]);
  const matches = useMemo(() => new Set(result.matches.map(person => person.id)), [result.matches]);
  const nodes = useMemo(() => (layout?.nodes ?? []).map(person => ({
    id: person.id,
    position: { x: person.x, y: person.y },
    data: { label: <div className="tree-person">
      <span className="person-avatar">{initials(person.full_name)}</span>
      <div>
        <strong title={person.full_name}>{person.full_name}</strong>
        <span>Gen {indexed.generations.get(person.id) ?? '—'}{searching && !matches.has(person.id) ? ' · Ancestor' : ''}</span>
      </div>
    </div> },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    className: searching && !matches.has(person.id) ? 'kinship-context-node' : 'kinship-match-node',
    style: { width: NODE_WIDTH, height: NODE_HEIGHT },
  })), [layout, indexed, searching, matches]);
  const edges = useMemo(() => (layout?.edges ?? []).map(edge => ({ ...edge, type: 'smoothstep' })), [layout]);

  if (!people.length) return <section className="tree-panel explorer"><Empty title="Your family story starts here"><p>Add a person or import your family records.</p>{emptyAction}</Empty></section>;

  return <section className="tree-panel explorer" aria-label="Family diagram">
    <div className="explorer-tools">
      <label>Search by name
        <span className="explorer-search"><Search size={17} aria-hidden="true"/><input type="search" placeholder="Find a person" value={name} onChange={event => setName(event.target.value)}/></span>
      </label>
      <label>Generation
        <select value={generation} onChange={event => setGeneration(event.target.value)}>
          <option value="">All generations</option>
          {levels.map(level => <option key={level} value={level}>Generation {level}</option>)}
        </select>
      </label>
      <button className="secondary explorer-view" type="button" aria-pressed={list} onClick={() => setList(!list)}>
        {list ? <Network size={17}/> : <List size={17}/>} {list ? 'Diagram' : 'List'}
      </button>
    </div>
    <div className="explorer-context">
      {searching ? <>
        <span role="status"><strong>{result.matches.length} {result.matches.length === 1 ? 'match' : 'matches'}</strong> · All matches in one diagram, with ancestor links.</span>
        <button className="text-button" onClick={() => { setName(''); setGeneration(''); }}><X size={14}/> Clear search</button>
      </> : <>
        <select aria-label="Focus person" value={focus || ''} onChange={event => onFocus(event.target.value)}>
          {people.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
        </select>
        <div className="segmented" aria-label="Branch direction">
          <button aria-pressed={direction === 'ancestors'} className={direction === 'ancestors' ? 'selected' : ''} onClick={() => setDirection('ancestors')}>Ancestors</button>
          <button aria-pressed={direction === 'descendants'} className={direction === 'descendants' ? 'selected' : ''} onClick={() => setDirection('descendants')}>Descendants</button>
        </div>
        <select className="branch-depth" aria-label="Branch depth" value={depth} onChange={event => setDepth(Number(event.target.value))}>
          {[2,3,4,5,6,7,8].map(level => <option key={level} value={level}>{level} levels</option>)}
        </select>
      </>}
    </div>
    <div className="tree-canvas">
      {!result.matches.length ? <Empty title="No matching people"><p>Try another name or generation.</p></Empty>
        : list ? <div className="tree-list">{result.matches.map(person => <button key={person.id} onClick={() => onPerson(person)}>
          <span className="person-avatar">{initials(person.full_name)}</span><span>{person.full_name}</span>
          <span className="muted">Gen {indexed.generations.get(person.id) ?? '—'}{person.gender ? ` · ${genderOptions[person.gender]}` : ''}</span>
        </button>)}</div>
        : <ReactFlowProvider><ReactFlow
          nodes={nodes} edges={edges} fitView minZoom={0.02} maxZoom={2}
          nodesDraggable={false} nodesConnectable={false} onlyRenderVisibleElements zoomOnScroll={false}
          onNodeClick={(_, node) => { const person = indexed.byId.get(node.id); if (person) onPerson(person); }}>
          <FitDiagram layoutKey={layout}/>
          <Background color="#bfced4" gap={22} size={1}/>
          <Controls showInteractive={false}/>
        </ReactFlow></ReactFlowProvider>}
    </div>
    <footer className="tree-footer">Generation 1 starts with the earliest recorded ancestors. Numbering updates as parent links are added.</footer>
  </section>;
}
