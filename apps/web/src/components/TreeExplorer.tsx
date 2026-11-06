import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, type Node, type NodeProps, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { List, Maximize2, Minimize2, Network, Search, X } from 'lucide-react';
import { familyBranch, indexFamily, searchFamily, type TreeRecord } from '@family-tree/core/generations';
import type { Relationship } from '@family-tree/core/relationships';
import { layoutMembers, NODE_WIDTH, NODE_HEIGHT } from '@family-tree/core/layout';
import { genderOptions, type Gender } from '@family-tree/core/gender';
import { Empty, initials } from './UI';

export type DiagramPerson = TreeRecord & { gender: Gender | null };

type PersonNode = Node<{ label: ReactNode }, 'person'>;
function PersonDiagramNode({ data }: NodeProps<PersonNode>) {
  return <>
    <Handle type="target" position={Position.Top} isConnectable={false}/>
    <Handle type="source" position={Position.Bottom} isConnectable={false}/>
    <Handle type="target" position={Position.Left} id="spouse-in" isConnectable={false}/>
    <Handle type="source" position={Position.Right} id="spouse-out" isConnectable={false}/>
    {data.label}
  </>;
}
const nodeTypes = { person: PersonDiagramNode };
const noRelationships: Relationship[] = [];

function FitDiagram({ layoutKey, expanded }: { layoutKey: unknown; expanded: boolean }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => void fitView({ padding: 0.2, maxZoom: 1.15 }));
    return () => cancelAnimationFrame(frame);
  }, [fitView, layoutKey, expanded]);
  return null;
}

export function TreeExplorer<T extends DiagramPerson>({
  people, relationships = noRelationships, focus, onFocus, onPerson, emptyAction,
}: {
  people: T[];
  relationships?: Relationship[];
  focus?: string;
  onFocus: (id: string) => void;
  onPerson: (person: T) => void;
  emptyAction?: ReactNode;
}) {
  const [name, setName] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<number[]>([]);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const generationMenu = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (panel.open) panel.close();
    if (expanded) {
      panel.showModal();
      fullscreenButton.current?.focus({ preventScroll: true });
    } else {
      panel.setAttribute('open', '');
    }
  }, [expanded, people.length > 0]);
  function openPerson(person: T) {
    if (expanded) setExpanded(false);
    onPerson(person);
  }
  const [direction, setDirection] = useState<'family' | 'ancestors' | 'descendants'>('family');
  const [depth, setDepth] = useState(4);
  const [list, setList] = useState(false);
  const term = useDeferredValue(name);
  const indexed = useMemo(() => indexFamily(people, relationships), [people, relationships]);
  const levels = useMemo(() => [...new Set(indexed.generations.values())].sort((a, b) => a - b), [indexed]);
  const searching = !!term.trim() || selectedLevels.length > 0;
  const result = useMemo(() => {
    if (searching) return searchFamily(indexed, term, selectedLevels);
    const branch = focus ? familyBranch(indexed, focus, direction, depth) : [];
    return { matches: branch, diagram: branch };
  }, [indexed, searching, term, selectedLevels, focus, direction, depth]);
  const layout = useMemo(() => list ? null : layoutMembers(result.diagram, relationships, indexed.generations), [list, result.diagram, relationships, indexed.generations]);
  const matches = useMemo(() => new Set(result.matches.map(person => person.id)), [result.matches]);
  const nodes = useMemo(() => (layout?.nodes ?? []).map(person => ({
    id: person.id,
    type: 'person' as const,
    position: { x: person.x, y: person.y },
    data: { label: <div className="tree-person">
      <span className="person-avatar">{initials(person.full_name)}</span>
      <div>
        <strong title={person.full_name}>{person.full_name}</strong>
        <span>Gen {indexed.generations.get(person.id) ?? '—'}{searching && !matches.has(person.id) ? ' · Related' : ''}</span>
      </div>
    </div> },
    className: searching && !matches.has(person.id) ? 'kinship-context-node' : 'kinship-match-node',
    style: { width: NODE_WIDTH, height: NODE_HEIGHT },
  })), [layout, indexed, searching, matches]);
  const edges = useMemo(() => (layout?.edges ?? []).map(edge => ({
    ...edge,
    type: edge.kind === 'spouse' ? 'straight' : 'smoothstep',
    style: { stroke: '#648575', strokeWidth: 1.5 },
    ...(edge.kind === 'spouse' ? { sourceHandle: 'spouse-out', targetHandle: 'spouse-in', style: { stroke: '#785582', strokeWidth: 2 } } : {}),
    ...(edge.kind === 'adopted_child' ? { style: { stroke: '#1b6755', strokeDasharray: '5 4', strokeWidth: 2 } } : {}),
    labelStyle: { fill: '#18352d', fontSize: 12, fontWeight: 600 },
    label: edge.kind === 'spouse' ? 'Spouse' : edge.kind === 'adopted_child' ? 'Adopted' : edge.kind === 'son' ? 'Son' : edge.kind === 'daughter' ? 'Daughter' : undefined,
  })), [layout]);

  if (!people.length) return <section className="tree-panel explorer"><Empty title="Your family story starts here"><p>Add a person or import your family records.</p>{emptyAction}</Empty></section>;

  return <dialog ref={dialog} className="tree-panel explorer explorer-dialog" aria-label="Family diagram"
    onCancel={event => { event.preventDefault(); setExpanded(false); }}>
    <div className="explorer-title"><h2>Family diagram</h2><span className="badge">{list ? 'List view' : expanded ? 'Full screen' : 'Tree view'}</span></div>
    <div className="explorer-tools">
      <label>Search by name
        <span className="explorer-search"><Search size={17} aria-hidden="true"/><input type="search" placeholder="Find a person" value={name} onChange={event => setName(event.target.value)}/></span>
      </label>
      <div className="generation-filter">
        <span className="explorer-field-label">Generations</span>
        <details className="generation-menu" ref={generationMenu}>
          <summary>{selectedLevels.length ? `${selectedLevels.length} selected` : 'All generations'}</summary>
          <div className="generation-options">
            <fieldset>
              <legend className="sr-only">Select generations to show</legend>
              <div className="generation-checkboxes">
                {levels.map(level => <label key={level}>
                  <input type="checkbox" checked={selectedLevels.includes(level)} onChange={event =>
                    setSelectedLevels(current => event.target.checked ? [...current, level] : current.filter(value => value !== level))}/>
                  Generation {level}
                </label>)}
              </div>
            </fieldset>
            <div className="generation-actions">
              <button type="button" className="text-button" onClick={() => setSelectedLevels([])}>Clear</button>
              <button type="button" className="secondary" onClick={() => {
                if (generationMenu.current) generationMenu.current.open = false;
              }}>Done</button>
            </div>
          </div>
        </details>
      </div>
      <div className="explorer-buttons">
        <button className="secondary explorer-view" type="button" aria-pressed={list} onClick={() => setList(!list)}>
          {list ? <Network size={17}/> : <List size={17}/>} {list ? 'Diagram' : 'List'}
        </button>
        <button ref={fullscreenButton} className="secondary explorer-view" type="button" aria-pressed={expanded}
          aria-label={expanded ? 'Exit full screen' : 'Enter full screen'} onClick={() => {
            if (generationMenu.current) generationMenu.current.open = false;
            setExpanded(!expanded);
          }}>
          {expanded ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}
          <span className="fullscreen-label">{expanded ? 'Exit full screen' : 'Full screen'}</span>
        </button>
      </div>
    </div>
    <div className="explorer-context">
      {searching ? <>
        <span role="status"><strong>{result.matches.length} {result.matches.length === 1 ? 'match' : 'matches'}</strong> · {selectedLevels.length ? 'Showing only selected generations' : 'Showing matching people and family links'}.</span>
        <button className="text-button" onClick={() => { setName(''); setSelectedLevels([]); }}><X size={14}/> Clear search</button>
      </> : <>
        <select aria-label="Focus person" value={focus || ''} onChange={event => onFocus(event.target.value)}>
          {people.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
        </select>
        <div className="segmented" aria-label="Branch direction">
          <button aria-pressed={direction === 'family'} className={direction === 'family' ? 'selected' : ''} onClick={() => setDirection('family')}>Family</button>
          <button aria-pressed={direction === 'ancestors'} className={direction === 'ancestors' ? 'selected' : ''} onClick={() => setDirection('ancestors')}>Ancestors</button>
          <button aria-pressed={direction === 'descendants'} className={direction === 'descendants' ? 'selected' : ''} onClick={() => setDirection('descendants')}>Descendants</button>
        </div>
        {direction !== 'family' && <select className="branch-depth" aria-label="Branch depth" value={depth} onChange={event => setDepth(Number(event.target.value))}>
          {[2,3,4,5,6,7,8].map(level => <option key={level} value={level}>{level} levels</option>)}
        </select>}
      </>}
    </div>
    <div className="tree-canvas">
      {!result.matches.length ? <Empty title="No matching people"><p>Try another name or generation.</p></Empty>
        : list ? <div className="tree-list">{result.matches.map(person => <button key={person.id} onClick={() => openPerson(person)}>
          <span className="person-avatar">{initials(person.full_name)}</span><span>{person.full_name}</span>
          <span className="muted">Gen {indexed.generations.get(person.id) ?? '—'}{person.gender ? ` · ${genderOptions[person.gender]}` : ''}</span>
        </button>)}</div>
        : <ReactFlowProvider><ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.02} maxZoom={2}
          nodesDraggable={false} nodesConnectable={false} onlyRenderVisibleElements zoomOnScroll={false}
          onNodeClick={(_, node) => { const person = indexed.byId.get(node.id); if (person) openPerson(person); }}>
          <FitDiagram layoutKey={layout} expanded={expanded}/>
          <Background color="#c5d7c8" gap={22} size={1}/>
          <Controls showInteractive={false}/>
        </ReactFlow></ReactFlowProvider>}
    </div>
    <footer className="tree-footer" aria-label="Diagram legend">
      <span className="tree-legend">Parent and child</span>
      <span className="tree-legend spouse">Spouse</span>
      <span className="tree-legend adoption">Adopted child</span>
    </footer>
  </dialog>;
}
