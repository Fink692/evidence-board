import { useEffect, useId, useState } from 'react';
import { Save } from 'lucide-react';
import type { BoardStore, Confidence, Source } from '../domain/types';
import { errorMessage } from '../lib/format';
import { Modal } from './ui';

export function SourceEditor({ source, store, onClose }: { source: Source | null; store: BoardStore; onClose: () => void }) {
  const formId = useId();
  const [title, setTitle] = useState(''); const [publisher, setPublisher] = useState(''); const [date, setDate] = useState('');
  const [url, setUrl] = useState(''); const [excerpt, setExcerpt] = useState(''); const [confidence, setConfidence] = useState<Confidence>('medium'); const [error, setError] = useState('');
  useEffect(() => { if (source) { setTitle(source.title); setPublisher(source.publisher); setDate(source.date); setUrl(source.url || ''); setExcerpt(source.excerpt); setConfidence(source.reliability); setError(''); } }, [source]);
  return <Modal open={Boolean(source)} onClose={onClose} title="Keep the source record accurate." subtitle="These details are shared by every evidence item citing this source." footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" type="submit" form={formId}><Save size={15} />Save source</button></>}>
    <form id={formId} className="editor-form" onSubmit={event => { event.preventDefault(); if (!source) return; try { const { url: oldUrl, ...rest } = source; store.updateSource({ ...rest, title: title.trim(), publisher: publisher.trim(), date, excerpt: excerpt.trim(), reliability: confidence, ...(url.trim() ? { url: url.trim() } : {}) }); onClose(); } catch (err) { setError(errorMessage(err)); } }}>
      <label className="field-label">Source title<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label className="field-label">Publisher or author<input required maxLength={160} value={publisher} onChange={event => setPublisher(event.target.value)} /></label>
      <div className="form-grid"><label className="field-label">Publication or observation date <span className="optional">(if known)</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label><label className="field-label">Source confidence<select value={confidence} onChange={event => setConfidence(event.target.value as Confidence)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div>
      <label className="field-label">Original URL <span className="optional">(optional)</span><input type="url" maxLength={2048} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" /></label>
      <label className="field-label">Original excerpt or field notes<textarea required rows={7} maxLength={6000} value={excerpt} onChange={event => setExcerpt(event.target.value)} /></label>
      <p className="inline-note">Keep your interpretation in the evidence item. Record the source’s actual wording or your original observation here. You can undo source edits.</p>{error && <p className="form-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}
