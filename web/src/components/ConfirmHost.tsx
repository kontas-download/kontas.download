'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/client';

type Pending = { message: string; resolve: (ok: boolean) => void };

let open: ((message: string) => Promise<boolean>) | null = null;

/** Non blocking replacement for window.confirm(). Falls back to the native dialog until the host is mounted. */
export function askConfirm(message: string): Promise<boolean> {
  return open ? open(message) : Promise.resolve(typeof window !== 'undefined' ? window.confirm(message) : false);
}

export function ConfirmHost() {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    open = message => new Promise<boolean>(resolve => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setPending(prev => { prev?.resolve(false); return { message, resolve }; });
    });
    return () => { open = null; };
  }, []);

  const finish = useCallback((ok: boolean) => {
    setPending(prev => { prev?.resolve(ok); return null; });
    returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, finish]);

  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print" onMouseDown={e => { if (e.target === e.currentTarget) finish(false); }}>
      <div role="alertdialog" aria-modal="true" aria-describedby="confirm-message" className="toast-in w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <p id="confirm-message" className="text-base text-slate-100 whitespace-pre-line">{pending.message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} onClick={() => finish(false)} className="px-3 py-2 rounded-lg border border-slate-700 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition-colors">
            {t('common.cancel')}
          </button>
          <button onClick={() => finish(true)} className="px-3 py-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors">
            {t('common.yes')}
          </button>
        </div>
      </div>
    </div>
  );
}
