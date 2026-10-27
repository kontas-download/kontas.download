'use client';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { DocLanguageSelect } from './DocLanguageSelect';
type Choice={id:number;series?:string;number:string};
export function InvoiceDeliveryDialog({invoices,initialId,emailMode=false,onClose}:{invoices:Choice[];initialId?:number;emailMode?:boolean;onClose:()=>void}) {
  const t=useT();
  const [id,setId]=useState(initialId || invoices[0]?.id || 0);
  const [compose,setCompose]=useState(emailMode);
  const [to,setTo]=useState(''),[subject,setSubject]=useState(''),[text,setText]=useState('');
  const [url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[sent,setSent]=useState(false),[configured,setConfigured]=useState(false);
  const [requestId,setRequestId]=useState('');
  const [lang,setLang]=useState(''),[draftLang,setDraftLang]=useState('');
  function selectLanguage(value:string){if(value===lang)return;setLoading(true);setError('');setSent(false);setUrl('');setRequestId('');setLang(value);}
  function selectInvoice(value:number){setLoading(true);setError('');setSent(false);setUrl('');setRequestId('');setId(value);}
  useEffect(()=>{
    let cancelled=false,objectUrl='';
    (async()=>{
      try {
        if(!id)throw new Error(t('delivery.noInvoices'));
        const query=lang?'?lang='+lang:'';const draftResponse=await fetch('/api/invoices/'+id+'/email'+query);const draft=await draftResponse.json();if(!draftResponse.ok)throw new Error(draft.error);
        const pdf=await fetch('/api/invoices/'+id+'/pdf'+query);if(!pdf.ok){const failure=await pdf.json();throw new Error(failure.error);}
        objectUrl=URL.createObjectURL(await pdf.blob());
        if(cancelled){URL.revokeObjectURL(objectUrl);return;}
        setRequestId(crypto.randomUUID());setDraftLang(draft.lang);setTo(draft.to);setSubject(draft.subject);setText(draft.text);setConfigured(draft.configured);setUrl(objectUrl);
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:t('delivery.pdfFailed'));}
      finally{if(!cancelled)setLoading(false);}
    })();
    return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[id,lang,t]);
  async function send(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
    const response=await fetch('/api/invoices/'+id+'/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to,subject,text,requestId,lang:lang||draftLang})});const result=await response.json();if(!response.ok)throw new Error(result.error);setSent(true);
  }catch(e){setError(e instanceof Error?e.message:t('delivery.sendFailed'));}finally{setBusy(false);}}
  return <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 no-print" role="dialog" aria-modal="true" aria-label={t('delivery.dialogLabel')}>
    <div className="bg-white text-slate-900 rounded-xl shadow-xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b"><strong>{t('delivery.dialogLabel')}</strong>
        {invoices.length>1&&<select aria-label={t('delivery.invoice')} value={id} disabled={busy} onChange={e=>selectInvoice(Number(e.target.value))} className="border rounded px-2 py-1">{invoices.map(i=><option key={i.id} value={i.id}>{i.series} {i.number}</option>)}</select>}
        {url&&<><a href={url} download={'Invoice-'+id+'.pdf'} className="text-emerald-700 underline">{t('delivery.download')}</a><a href={url} target="_blank" rel="noreferrer" className="text-emerald-700 underline">{t('delivery.openPrint')}</a></>}
        <DocLanguageSelect value={lang} onChange={selectLanguage} disabled={busy} className="border rounded px-2 py-1"/>
        <button onClick={()=>setCompose(!compose)} disabled={busy} className="text-emerald-700 underline">{t('delivery.emailClient')}</button><button onClick={onClose} disabled={busy} className="ml-auto border rounded px-3 py-1" aria-label={t('delivery.close')}>{t('delivery.close')}</button>
      </div>
      {error&&<p role="alert" className="bg-red-50 text-red-800 p-3">{error}</p>}
      {sent&&<p role="status" className="bg-emerald-50 text-emerald-800 p-3">{t('delivery.sent')}</p>}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-auto">
        <div className="flex-1 min-h-[400px] bg-slate-100">{loading?<p className="p-8">{t('delivery.generating')}</p>:url?<iframe src={url} title={t('delivery.pdfTitle')} className="w-full h-full min-h-[400px]"/>:<p className="p-8">{t('delivery.noPreview')}</p>}</div>
        {compose&&<form onSubmit={send} className="p-5 md:w-96 space-y-4 overflow-y-auto">
          <p className="text-sm">{t('delivery.attachNote')}</p>
          <label className="block text-sm">{t('delivery.to')}<input type="email" required value={to} disabled={busy||sent} onChange={e=>setTo(e.target.value)} className="block border rounded p-2 w-full"/></label>
          <label className="block text-sm">{t('delivery.subject')}<input required maxLength={200} value={subject} disabled={busy||sent} onChange={e=>setSubject(e.target.value)} className="block border rounded p-2 w-full"/></label>
          <label className="block text-sm">{t('delivery.body')}<textarea required maxLength={10000} rows={10} value={text} disabled={busy||sent} onChange={e=>setText(e.target.value)} className="block border rounded p-2 w-full"/></label>
          {!loading&&!configured&&<p className="text-amber-800 text-sm">{t('delivery.notConfigured')}</p>}
          <button type="submit" disabled={loading||busy||sent||!configured||!url} className="bg-emerald-700 text-white px-4 py-2 rounded disabled:opacity-40">{busy?t('delivery.sending'):sent?t('delivery.sentShort'):t('delivery.send')}</button>
        </form>}
      </div>
    </div>
  </div>;
}
