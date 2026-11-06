import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle, X, TreePine } from 'lucide-react';
import { message } from '../lib';
export function Mark() { return <span className="brand-mark"><TreePine size={24}/></span>; }
export function Loading({ text = 'Loading your family…' }: { text?: string }) { return <div className="empty"><LoaderCircle className="spin"/><p>{text}</p></div>; }
export function ErrorBox({ error }: { error: unknown }) { return error ? <div className="error" role="alert">{message(error)}</div> : null; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><TreePine size={32}/><h3>{title}</h3>{children}</div>; }
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    panel.showModal();
    return () => panel.close();
  }, []);
  return <dialog ref={dialog} className="record-dialog" aria-label={title}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    }}>
    <header><h2>{title}</h2><button type="button" autoFocus className="icon-button" aria-label="Close dialog" onClick={close}><X size={20}/></button></header>
    {children}
  </dialog>;
}
export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function run(fn: () => Promise<unknown>, success = '') {
    if (busy) return false; setBusy(true); setError(''); setNotice('');
    try { await fn(); setNotice(success); return true; } catch (e) { setError(message(e)); return false; } finally { setBusy(false); }
  }
  return { busy, error, notice, run, reset: () => { setError(''); setNotice(''); } };
}
export function ActionStatus({ action }: { action: ReturnType<typeof useAction> }) { return <><ErrorBox error={action.error}/>{action.notice && <div className="notice" role="status">{action.notice}</div>}</>; }
export function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0,2).map(n => [...n][0]).join('').toUpperCase(); }
