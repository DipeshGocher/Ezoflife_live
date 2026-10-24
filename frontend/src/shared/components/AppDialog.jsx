import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, Info, PencilLine } from 'lucide-react';
import { useAppDialogStore } from '../stores/appDialogStore';

function DialogContent({ dialog, settle }) {
  const panel = useRef(null);
  const initialFocus = useRef(null);
  const [value, setValue] = useState(dialog.defaultValue ?? '');
  const isAlert = dialog.kind === 'alert';
  const isPrompt = dialog.kind === 'prompt';
  const Icon = isAlert ? Info : isPrompt ? PencilLine : CircleHelp;
  const title = dialog.title || (isAlert ? 'Notice' : isPrompt ? 'Enter details' : 'Please confirm');
  const cancel = () => settle(dialog.id, isPrompt ? null : isAlert ? undefined : false);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const previousInert = root?.inert;
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';
    initialFocus.current?.focus();
    if (isPrompt) initialFocus.current?.select();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isPrompt]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
    if (event.key === 'Tab') {
      const controls = [...panel.current.querySelectorAll('button, input')];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return <div className="fixed inset-0 flex items-center justify-center bg-slate-950/50 px-5 py-8 backdrop-blur-sm" style={{ zIndex: 2147483647 }}>
    <section ref={panel} role={isAlert ? 'alertdialog' : 'dialog'} aria-modal="true"
      aria-labelledby={`dialog-title-${dialog.id}`} aria-describedby={`dialog-message-${dialog.id}`}
      onKeyDown={handleKeyDown}
      className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100" aria-hidden="true">
        <Icon size={24} strokeWidth={1.8} />
      </div>
      <h2 id={`dialog-title-${dialog.id}`} className="text-xl font-black tracking-tight">{title}</h2>
      <p id={`dialog-message-${dialog.id}`} className="mt-3 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-slate-600">{dialog.message}</p>
      <form onSubmit={event => {
        event.preventDefault();
        settle(dialog.id, isPrompt ? value : isAlert ? undefined : true);
      }}>
        {isPrompt && <input ref={initialFocus} aria-label={dialog.inputLabel || 'Your response'} value={value}
          onChange={event => setValue(event.target.value)}
          className="mt-5 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15" />}
        <div className="mt-7 flex justify-end gap-3">
          {!isAlert && <button ref={isPrompt ? undefined : initialFocus} type="button" onClick={cancel}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
            {dialog.cancelLabel || 'Cancel'}
          </button>}
          <button ref={isAlert ? initialFocus : undefined} type="submit"
            className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
            {dialog.confirmLabel || (isAlert ? 'OK' : 'Confirm')}
          </button>
        </div>
      </form>
    </section>
  </div>;
}

export default function AppDialog() {
  const dialog = useAppDialogStore(state => state.queue[0]);
  const settle = useAppDialogStore(state => state.settle);
  return dialog ? createPortal(<DialogContent key={dialog.id} dialog={dialog} settle={settle} />, document.body) : null;
}
