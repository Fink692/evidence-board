import { useEffect, useId, useState, type FormEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { BoardNode, BoardState, BoardStore } from '../domain/types';
import { copy } from '../i18n/en-CA';
import { errorMessage, makeId } from '../lib/format';
import { Modal } from './ui';

export interface ConflictEditorProps {
  open: boolean;
  onClose: () => void;
  state: BoardState;
  store: BoardStore;
  node?: BoardNode;
}

export function ConflictEditor({ open, onClose, state, store, node }: ConflictEditorProps) {
  const formId = useId();
  const helpId = `${formId}-selection-help`;
  const countId = `${formId}-selection-count`;
  const errorId = `${formId}-error`;
  const initialNodeId = node?.id;
  const [conflictId, setConflictId] = useState(() => makeId('conflict'));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setConflictId(makeId('conflict'));
    setTitle('');
    setDescription('');
    setError('');
    setSelectedIds(initialNodeId && store.getState().content.nodes.some((item) => item.id === initialNodeId)
      ? [initialNodeId]
      : []);
  }, [open, initialNodeId, store]);

  // Keep every selected item visible and omit an item removed while this form
  // was open. The store still revalidates the complete conflict at submission.
  const selectedNodes = state.content.nodes.filter((item) => selectedIds.includes(item.id));
  const selectedCount = selectedNodes.length;

  function toggle(id: string) {
    setError('');
    setSelectedIds((previous) => {
      const current = previous.filter((selectedId) => state.content.nodes.some((item) => item.id === selectedId));
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id);
      return current.length < 20 ? [...current, id] : current;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (!title.trim()) throw new Error('Give this conflict a short, descriptive title.');
      if (!description.trim()) throw new Error('Describe the disagreement or uncertainty you want to keep visible.');
      if (selectedCount < 2 || selectedCount > 20) throw new Error('Choose between 2 and 20 items involved in this conflict.');
      store.applyHumanOperations([{
        type: 'flag_conflict',
        conflict: {
          id: conflictId,
          title: title.trim(),
          description: description.trim(),
          nodeIds: selectedNodes.map((item) => item.id),
          resolved: false,
          createdBy: 'human',
        },
      }], 'Flagged a conflict');
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return <Modal
    open={open}
    onClose={onClose}
    title="Flag a conflict"
    subtitle="Keep competing evidence and assumptions visible."
    footer={<>
      <span className="quiet">Adds to your accepted board. You can undo this.</span>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form={formId} className="button primary" disabled={selectedCount < 2 || selectedCount > 20}>
          <TriangleAlert size={16} aria-hidden="true" />Add conflict
        </button>
      </div>
    </>}
  >
    <form id={formId} className="editor-form" onSubmit={submit}>
      <label className="field-label">Conflict title
        <input required autoComplete="off" maxLength={160} value={title}
          onChange={(event) => setTitle(event.target.value)} placeholder="What does the evidence disagree about?" />
      </label>
      <label className="field-label">Description
        <textarea required rows={3} maxLength={6_000} value={description}
          onChange={(event) => setDescription(event.target.value)} placeholder="Explain the tension, including any differences in methods, context, or assumptions." />
      </label>
      <fieldset style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}
        aria-describedby={`${helpId} ${countId}${error ? ` ${errorId}` : ''}`}>
        <legend className="field-label">Affected items</legend>
        <p id={helpId} className="quiet" style={{ margin: '7px 0 12px', lineHeight: 1.6 }}>
          Choose 2 to 20 items involved in the conflict. Include the relevant claim when comparing its evidence.
        </p>
        <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto', padding: 3 }}>
          {state.content.nodes.map((item) => {
            const checked = selectedIds.includes(item.id);
            const disabled = !checked && selectedCount >= 20;
            return <label key={item.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 12px',
              minHeight: 48, border: `1px solid ${checked ? '#8dab6d' : '#d5dfc6'}`,
              borderRadius: 6, background: checked ? '#edf3e0' : '#fffef9',
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.65 : 1,
            }}>
              <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(item.id)}
                aria-label={`Include: ${item.title}`}
                style={{ width: 18, height: 18, margin: '2px 0 0', flexShrink: 0, accentColor: '#4d693f' }} />
              <span style={{ minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                <span style={{ display: 'block', fontSize: 14, color: '#334e30' }}>{item.title}</span>
                <span className={`node-type ${item.kind}`} style={{ marginTop: 4 }}>{copy.kind[item.kind]}</span>
              </span>
            </label>;
          })}
          {state.content.nodes.length < 2 && <p className="inline-note">Add at least two board items before flagging a conflict.</p>}
        </div>
        <p id={countId} className="quiet" aria-live="polite" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          {selectedCount} of 20 selected.{selectedCount < 2 ? ` Choose ${2 - selectedCount} more ${selectedCount === 1 ? 'item' : 'items'} to continue.` : selectedCount === 20 ? ' The selection limit is reached.' : ''}
        </p>
      </fieldset>
      {error && <p id={errorId} className="form-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}
