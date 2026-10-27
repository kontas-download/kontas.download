'use client';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/client';
const empty={host:'',port:587,secure:false,sender:'',username:'',password:'',enabled:false,hasPassword:false,clearPassword:false};
export function CompanySmtpDialog({company,onClose}:{company:{id:number;name:string;email?:string|null};onClose:()=>void}) {
  const t=useT();
  const [form,setForm]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  useEffect(()=>{let cancelled=false;(async()=>{try{const r=await fetch(`/api/companies/${company.id}/smtp`);const data=await r.json();if(!r.ok)throw Error(data.error);if(!cancelled)setForm({...empty,...data,sender:data.sender||company.email||''});}catch(e){if(!cancelled)setError(e instanceof Error?e.message:t('common.error'));}finally{if(!cancelled)setLoading(false);}})();return()=>{cancelled=true;};},[company.id,company.email,t]);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setSaved(false);try{const r=await fetch(`/api/companies/${company.id}/smtp`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const data=await r.json();if(!r.ok)throw Error(data.error);setForm({...empty,...data});setSaved(true);}catch(e){setError(e instanceof Error?e.message:t('common.error'));}finally{setBusy(false);}}
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label={t('companies.smtpTitle')}><form onSubmit={save} className="bg-white text-slate-900 rounded-xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto space-y-4">
    <h2 className="font-bold text-lg">SMTP — {company.name}</h2><p className="text-sm text-slate-600">{t('companies.smtpIntro')}</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{saved&&<p role="status" className="text-emerald-700">{t('companies.settingsSaved')}</p>}
    <fieldset disabled={loading||busy} className="space-y-3 disabled:opacity-50">
      <label className="block"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/> {t('companies.smtpEnable')}</label>
      <label className="block text-sm">{t('companies.smtpServer')}<input required value={form.host} onChange={e=>setForm({...form,host:e.target.value})} className="block border rounded p-2 w-full" placeholder="smtp.example.com"/></label>
      <label className="block text-sm">{t('companies.smtpPort')}<input required type="number" min={1} max={65535} value={form.port} onChange={e=>setForm({...form,port:Number(e.target.value)})} className="block border rounded p-2 w-full"/></label>
      <label className="block text-sm">{t('companies.smtpEncryption')}<select value={String(form.secure)} onChange={e=>setForm({...form,secure:e.target.value==='true'})} className="block border rounded p-2 w-full"><option value="false">{t('companies.smtpStarttls')}</option><option value="true">{t('companies.smtpTls')}</option></select></label>
      <label className="block text-sm">{t('companies.smtpSender')}<input required type="email" value={form.sender} onChange={e=>setForm({...form,sender:e.target.value})} className="block border rounded p-2 w-full"/></label>
      <label className="block text-sm">{t('companies.smtpUsername')}<input autoComplete="off" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} className="block border rounded p-2 w-full"/></label>
      <label className="block text-sm">{t('companies.smtpPassword')}<input type="password" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value,clearPassword:false})} placeholder={form.hasPassword?t('companies.smtpPasswordKept'):''} className="block border rounded p-2 w-full"/></label>
      {form.hasPassword&&<label className="block text-sm"><input type="checkbox" checked={form.clearPassword} onChange={e=>setForm({...form,clearPassword:e.target.checked,password:''})}/> {t('companies.smtpClearPassword')}</label>}
    </fieldset>
    <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="border rounded px-3 py-2">{t('common.close')}</button><button disabled={loading||busy} className="bg-emerald-700 text-white rounded px-3 py-2 disabled:opacity-40">{busy?t('companies.saving'):t('common.save')}</button></div>
  </form></div>;
}
