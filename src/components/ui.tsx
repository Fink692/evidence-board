import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X, ArrowUpRight, Check, AlertCircle, Minus } from 'lucide-react';
import type { Stance } from '../domain/types';
import { copy } from '../i18n/en-CA';

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
}

export function StanceTag({ stance }: { stance: Stance }) {
  const Icon = stance === 'supports' ? Check : stance === 'challenges' ? AlertCircle : Minus;
  return <span className={`stance-tag ${stance}`}><Icon size={12} aria-hidden="true" />{copy.stance[stance]}</span>;
}

export function EvidenceMark({ small = false }: { small?: boolean }) {
  return <span className={`evidence-mark ${small ? 'small' : ''}`} aria-hidden="true"><i /><i /><i /></span>;
}

export function Modal({ open, onClose, title, subtitle, children, footer, className = '' }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-container">
      <header className="modal-header"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton label="Close dialog" onClick={onClose}><X size={20} /></IconButton></header>
      <div className="modal-content">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </div>
  </dialog>;
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-link">{children}<ArrowUpRight size={14} aria-hidden="true" /></a>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true">{icon}</span><h2>{title}</h2><p>{children}</p>{action}</div>;
}
