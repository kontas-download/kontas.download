'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, X } from '@/components/icons';

type Toast = { id: number; text: string };

// Replaces the blocking window.alert() with a non blocking notice, so every existing alert() call becomes inline without per page changes.
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const nativeAlert = window.alert;
    let next = 1;
    window.alert = (message?: unknown) => {
      const id = next++;
      setToasts(list => [...list.slice(-3), { id, text: String(message ?? '') }]);
      window.setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 8000);
    };
    return () => { window.alert = nativeAlert; };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 grid gap-2 max-w-sm no-print" role="alert" aria-live="assertive">
      {toasts.map(t => (
        <div key={t.id} className="toast-in flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 shadow-2xl">
          <CircleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
          <span className="flex-1 break-words">{t.text}</span>
          <button onClick={() => setToasts(list => list.filter(x => x.id !== t.id))} aria-label="OK" className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
