const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-test-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))").run(1, 'Company A', 'A');
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))").run(2, 'Company B', 'B');
fixture.prepare("UPDATE Company SET vatCode='LTTEST1' WHERE id=1").run();
fixture.close();
const jar = new Map();
const realMailer = require('nodemailer');
const messages=[];
let failMail=false;
const realLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'nodemailer') return {createTransport: options => {assert.equal(options.disableFileAccess,true);const stream=realMailer.createTransport({streamTransport:true,buffer:true});return {close:()=>stream.close(),sendMail:async mail=>{if(failMail)throw new Error('SMTP timeout');const result=await stream.sendMail(mail);messages.push({mail,mime:result.message.toString()});return {...result,accepted:[mail.to],rejected:[]};}};}};
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const db = getDb();
const request = (method, body) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });
test('customer invoice PDFs and email',async t=>{
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'test@example.test','Tester','unused','admin',datetime('now'))").run();
    jar.set('auth_session',auth.createSessionToken({id:1}));jar.set('active_company_id','1');
    db.prepare("UPDATE Company SET name='UAB Pavyzdys',address='Vilniaus g. 1',bankIban='LT123456789012345678',email='seller@example.test',isVatPayer=0 WHERE id=1").run();
    db.prepare("INSERT INTO Client(id,companyId,name,code,email,isVatPayer,createdAt,updatedAt) VALUES(1,1,'Klientas Žąsinas','BUYER','buyer@example.test',0,datetime('now'),datetime('now'))").run();
    const invoices=require('../src/app/api/invoices/route.ts');
    const pdfRoute=require('../src/app/api/invoices/[id]/pdf/route.ts');
    const mailRoute=require('../src/app/api/invoices/[id]/email/route.ts');
    const {invoiceDocument}=require('../src/lib/invoice-document.ts');
    const {invoiceDefinition,renderInvoicePdf}=require('../src/lib/invoice-pdf.ts');
    let id;
    await t.test('non-PVM seller creates equal net and gross, no internal information in PDF model',async()=>{
      const response=await invoices.POST(request('POST',{number:'SF-001',saleDate:'2026-10-26',clientId:1,clientName:'Klientas Žąsinas',clientCode:'BUYER',statusName:'Apmokėta',notes:'INTERNAL-SECRET',items:[{itemName:'Paslauga (vnt.)',quantity:1,price:5.5,vatRate:0},{itemName:'Paslauga (vnt.)',quantity:1,price:154.5,vatRate:0}]}));assert.equal(response.status,200);id=(await response.json()).sale.id;
      const doc=invoiceDocument(id,1);assert.equal(doc.net,160);assert.equal(doc.total,160);assert.equal(doc.vat,0);
      const content=JSON.stringify(invoiceDefinition(doc));assert(!content.includes('Apmokėta'));assert(!content.includes('INTERNAL-SECRET'));assert(!content.includes('PVM SĄSKAITA'));assert(!content.includes('PVM %'));assert(!content.includes('Kaina be PVM'));assert(content.includes('PVM neskaičiuojamas'));
      assert.equal((await invoices.POST(request('POST',{number:'BAD',saleDate:'2026-10-26',clientName:'Buyer',items:[{itemName:'Service',quantity:1,price:10,vatRate:21}]}))).status,400);
    });
    await t.test('VAT-registered seller charges VAT even for a non-registered customer; snapshot survives company status change',async()=>{
      db.prepare('UPDATE Company SET isVatPayer=1 WHERE id=1').run();
      const result=await invoices.POST(request('POST',{number:'PVM-001',saleDate:'2026-10-26',clientId:1,clientName:'Klientas Žąsinas',items:[{itemName:'Paslauga',quantity:1,price:100,vatRate:21}]}));assert.equal(result.status,200);const vatId=(await result.json()).sale.id;const doc=invoiceDocument(vatId,1);assert.equal(doc.total,121);assert.equal(doc.buyer.isVatPayer,0);assert(doc.isVatPayer);
      db.prepare('UPDATE Company SET isVatPayer=0 WHERE id=1').run();assert(invoiceDocument(vatId,1).isVatPayer);
      const output=path.resolve('../output/pdf');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'vat-invoice.pdf'),await renderInvoicePdf(doc));
    });
    await t.test('short and long PDFs generate with all rows; wrong-company PDF is forbidden',async()=>{
      const response=await pdfRoute.GET(request('GET'),context(id));assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/pdf/);
      const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
      const output=path.resolve('../output/pdf');fs.writeFileSync(path.join(output,'customer-invoice.pdf'),bytes);
      const doc=invoiceDocument(id,1);const long={...doc,number:'LONG-001',items:Array.from({length:100},(_,i)=>({itemName:'Ilgas paslaugos aprašymas Žąsinas - eilutė '+(i+1),quantity:1,price:5,vatRate:0,sumWithoutVat:5,sumWithVat:5})),net:500,vat:0,total:500};fs.writeFileSync(path.join(output,'long-invoice.pdf'),await renderInvoicePdf(long));
      jar.set('active_company_id','2');assert.equal((await pdfRoute.GET(request('GET'),context(id))).status,404);jar.set('active_company_id','1');
    });
    await t.test('email draft contains customer email and PDF text; SMTP missing returns actionable error',async()=>{
      const response=await mailRoute.GET(request('GET'),context(id));const draft=await response.json();assert.equal(draft.to,'buyer@example.test');assert(draft.text.includes('160.00'));assert.equal(draft.configured,false);
      const result=await mailRoute.POST(request('POST',{to:draft.to,subject:draft.subject,text:draft.text,requestId:require('node:crypto').randomUUID()}),context(id));assert.equal(result.status,503);assert.equal(messages.length,0);
    });
    await t.test('email includes text and PDF MIME attachment, duplicate request sends only once',async()=>{
      process.env.SMTP_ENCRYPTION_KEY='ab'.repeat(32);
      require('../src/lib/company-mail.ts').saveMailSettings(1,{host:'smtp.example.test',port:587,secure:false,sender:'sender@example.test',username:'seller1',password:'test-password',enabled:true});
      const body={to:'buyer@example.test',subject:'Sąskaita SF-001',text:'Laba diena, pridedame sąskaitą.',requestId:require('node:crypto').randomUUID()};
      assert.equal((await mailRoute.POST(request('POST',body),context(id))).status,200);assert.equal((await mailRoute.POST(request('POST',body),context(id))).status,200);assert.equal(messages.length,1);assert.equal(messages[0].mail.text,body.text);assert.equal(messages[0].mail.attachments[0].content.subarray(0,5).toString(),'%PDF-');assert(messages[0].mime.includes('Content-Type: application/pdf'));assert(messages[0].mime.includes('Content-Type: text/plain'));assert(messages[0].mime.includes('Content-Disposition: attachment'));
    });
    await t.test('sent PDF is archived byte-for-byte, once, immutably and per company',async()=>{
      const crypto=require('node:crypto');const archiveRoute=require('../src/app/api/invoices/[id]/archive/route.ts');
      const sent=messages[0].mail.attachments[0].content;
      const list=await (await archiveRoute.GET(request('GET'),context(id))).json();
      assert.equal(list.archive.length,1);assert.equal(list.archive[0].sha256,crypto.createHash('sha256').update(sent).digest('hex'));assert.equal(list.archive[0].recipient,'buyer@example.test');assert.equal(list.archive[0].size,sent.length);
      const download=await archiveRoute.GET(new Request('http://localhost:3000/api/x?version='+list.archive[0].id),context(id));assert.equal(download.status,200);assert.equal(Buffer.compare(Buffer.from(await download.arrayBuffer()),sent),0);
      const snapshot=JSON.parse(db.prepare('SELECT snapshot FROM InvoiceArchive WHERE id=?').get(list.archive[0].id).snapshot);assert.equal(snapshot.seller.name,'UAB Pavyzdys');assert.equal(snapshot.buyer.name,'Klientas Žąsinas');
      assert.throws(()=>db.prepare('UPDATE InvoiceArchive SET pdf=? WHERE id=?').run(Buffer.from('x'),list.archive[0].id),/immutable/);assert.throws(()=>db.prepare('DELETE FROM InvoiceArchive WHERE id=?').run(list.archive[0].id),/immutable/);
      jar.set('active_company_id','2');assert.equal((await archiveRoute.GET(new Request('http://localhost:3000/api/x?version='+list.archive[0].id),context(id))).status,404);assert.equal((await (await archiveRoute.GET(request('GET'),context(id))).json()).archive.length,0);jar.set('active_company_id','1');
      assert.equal((await archiveRoute.GET(new Request('http://localhost:3000/api/x?version=abc'),context(id))).status,400);
    });
    await t.test('mail validation, CSRF, authorization and uncertain retries never send twice',async()=>{
      const body={to:'buyer@example.test',subject:'Invoice',text:'Text',requestId:require('node:crypto').randomUUID()};
      assert.equal((await mailRoute.POST(request('POST',{...body,to:'a@b.test,b@c.test'}),context(id))).status,400);
      assert.equal((await mailRoute.POST(request('POST',{...body,subject:'x\r\nBcc: bad@example.test'}),context(id))).status,400);
      jar.set('active_company_id','2');assert.equal((await mailRoute.POST(request('POST',body),context(id))).status,404);jar.set('active_company_id','1');
      failMail=true;assert.equal((await mailRoute.POST(request('POST',body),context(id))).status,502);assert.equal((await mailRoute.POST(request('POST',body),context(id))).status,409);failMail=false;assert.equal(messages.length,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM InvoiceArchive').get().n,1);
    });
    await t.test('company SMTP is isolated, encrypted, redacted and preserves passwords on edit',async()=>{
      const settings=require('../src/lib/company-mail.ts');const smtp=require('../src/app/api/companies/[id]/smtp/route.ts');const {mailConfiguration}=require('../src/lib/invoice-mail.ts');
      const body={host:'smtp.second.test',port:465,secure:true,sender:'second@example.test',username:'seller2',password:'second-password',enabled:true};
      let result=await smtp.PUT(request('PUT',body),context(2));assert.equal(result.status,200);let data=await result.json();assert.equal(data.hasPassword,true);assert(!JSON.stringify(data).includes('second-password'));assert(!('passwordEncrypted' in data));
      assert.equal(mailConfiguration(1).from,'sender@example.test');assert.equal(mailConfiguration(2).from,'second@example.test');assert.equal(mailConfiguration(2).transport.auth.pass,'second-password');
      const stored=settings.companyMail(2);assert(!stored.passwordEncrypted.includes('second-password'));assert.throws(()=>settings.decryptPassword({...stored,companyId:1}));
      result=await smtp.PUT(request('PUT',{...body,password:'',host:'smtp.updated.test'}),context(2));assert.equal(result.status,200);assert.equal(mailConfiguration(2).transport.auth.pass,'second-password');
      assert.equal((await smtp.PUT(request('PUT',{...body,password:'',username:'changed'}),context(2))).status,400);
      assert.equal((await smtp.GET(request('GET'),context(99999))).status,404);
      const cross=new Request('http://localhost:3000/api/companies/2/smtp',{method:'PUT',headers:{Origin:'https://untrusted.test','Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal((await smtp.PUT(cross,context(2))).status,403);
      settings.saveMailSettings(2,{...body,enabled:false,password:''});assert.throws(()=>mailConfiguration(2),/SMTP/);
      assert.equal(mailConfiguration(1).from,'sender@example.test');
    });
    await t.test('import field mapping preserves source unit price and zero VAT',()=>{
      const {importedUnitPrice}=require('../src/lib/import-values.ts');assert.equal(importedUnitPrice({priceWithoutVat:5.5,quantity:1}),5.5);assert.equal(importedUnitPrice({priceWithoutVat:154.5,quantity:1}),154.5);assert.equal(importedUnitPrice({priceWithoutVat:10,priceWithoutVatWithDiscount:8}),8);assert.equal(importedUnitPrice({price:0,quantity:1,sumWithoutVat:0}),0);
    });
    await t.test('inconsistent totals block PDF and sending',async()=>{
      db.prepare('UPDATE SaleItem SET sumWithVat=999 WHERE saleId=?').run(id);assert.equal((await pdfRoute.GET(request('GET'),context(id))).status,409);assert.equal((await mailRoute.GET(request('GET'),context(id))).status,409);
    });
  }finally{db.close();assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert(path.basename(temp).startsWith('erp-test-'));fs.rmSync(temp,{recursive:true,force:true});}
});
