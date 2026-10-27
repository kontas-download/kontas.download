'use client';

import React, { useState } from 'react';
import { AlertCircle, KeyRound, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

// The signed-in user changes their own password; the server ends their other sessions.
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== repeat) { setError(t('users.passwordsDiffer')); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('users.saveError'));
      setDone(true); setCurrent(''); setNext(''); setRepeat('');
    } catch (err) { setError(err instanceof Error ? err.message : t('users.saveError')); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('users.changePassword')}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="text-lg font-bold flex items-center gap-2"><KeyRound className="w-5 h-5 text-emerald-600" /><span>{t('users.changePassword')}</span></h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100" title={t('common.close')}><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mt-4 p-3 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
        {done ? (
          <>
            <div className="mt-4 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm">{t('users.passwordChanged')}</div>
            <div className="pt-4 flex justify-end"><button onClick={onClose} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium">{t('common.close')}</button></div>
          </>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-slate-700">{t('users.currentPassword')}<input type="password" autoComplete="current-password" required maxLength={1024} value={current} onChange={e => setCurrent(e.target.value)} className={input} /></label>
            <label className="block text-xs font-semibold text-slate-700">{t('users.newPassword')}<input type="password" autoComplete="new-password" required minLength={10} maxLength={1024} value={next} onChange={e => setNext(e.target.value)} className={input} /></label>
            <label className="block text-xs font-semibold text-slate-700">{t('users.repeatPassword')}<input type="password" autoComplete="new-password" required minLength={10} maxLength={1024} value={repeat} onChange={e => setRepeat(e.target.value)} className={input} /></label>
            <p className="text-[11px] text-slate-500">{t('users.passwordHint')}</p>
            <div className="pt-2 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">{t('common.cancel')}</button>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50">{t('common.save')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
