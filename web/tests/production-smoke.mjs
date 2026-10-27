import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { once } from 'node:events';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const temp = mkdtempSync(path.join(tmpdir(), 'erp-smoke-'));
const dbFile = path.join(temp, 'smoke.db');
const db = new Database(dbFile);
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
db.prepare("INSERT INTO Company(id,name,currencyCode,isDefault,createdAt,updatedAt) VALUES(1,'Smoke company','EUR',1,datetime('now'),datetime('now'))").run();
db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'smoke@example.test','Smoke',?,'admin',datetime('now'))").run('salt:' + createHash('sha256').update('saltSmokePassword123!').digest('hex'));
db.close();
const port = 3087;
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)], { cwd:process.cwd(), windowsHide:true, env:{...process.env,NEXT_BUILD_DIR:'.next-audit',DATABASE_URL:'file:'+dbFile,COOKIE_SECURE:'false',APP_ORIGIN:origin},stdio:['ignore','pipe','pipe'] });
let log='';server.stdout.on('data',c=>log+=c);server.stderr.on('data',c=>log+=c);
try {
  let ready=false;
  for(let i=0;i<100;i++) { if(server.exitCode!==null) throw new Error(log); try { if((await fetch(origin+'/login')).status===200){ready=true;break;} } catch {} await new Promise(r=>setTimeout(r,200)); }
  assert(ready,'Server startup timeout: '+log);
  for(const cookie of ['', 'auth_session=forged', 'auth_session='+ 'a'.repeat(64)]) {
    assert.equal((await fetch(origin+'/api/companies',{headers:{cookie},redirect:'manual'})).status,401);
    const page=await fetch(origin+'/',{headers:{cookie},redirect:'manual'});assert.equal(page.status,307);assert.match(page.headers.get('location'),/login/);
  }
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email:'smoke@example.test',password:'SmokePassword123!'})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const pages=['/','/companies','/accounts','/invoices','/purchases','/clients','/bank','/payrolls','/stock','/ledger','/trial-balance','/financial-statements','/tax-reports','/reconciliation'];
  for(const page of pages) { const response=await fetch(origin+page,{headers:{cookie}});assert.equal(response.status,200,page);const html=await response.text();assert(!html.includes('NEXT_HTTP_ERROR_FALLBACK;500'),page); }
  for(const api of ['companies','accounts','invoices','purchases','clients','bank','payrolls','stock','ledger']) assert.equal((await fetch(origin+'/api/'+api,{headers:{cookie}})).status,200,api);
  const created=await fetch(origin+'/api/invoices',{method:'POST',headers:{cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({number:'SMOKE-1',saleDate:'2026-10-26',clientName:'Test buyer',items:[{itemName:'Service',quantity:1,price:100,vatRate:0}]})});assert.equal(created.status,200);const invoice=(await created.json()).sale;assert.equal(invoice.sumWithVat,100);
  const pdf=await fetch(origin+'/api/invoices/'+invoice.id+'/pdf',{headers:{cookie}});assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  const draft=await fetch(origin+'/api/invoices/'+invoice.id+'/email',{headers:{cookie}});assert.equal(draft.status,200);assert.equal((await draft.json()).configured,false);
  const smtp=await fetch(origin+'/api/companies/1/smtp',{headers:{cookie}});assert.equal(smtp.status,200);assert.equal((await smtp.json()).hasPassword,false);
  assert.equal((await fetch(origin+'/api/companies/1/accounting-control',{headers:{cookie}})).status,200);
  assert.equal((await fetch(origin+'/api/tax-reports/isaf',{headers:{cookie}})).status,409);
  assert.equal((await fetch(origin+'/api/auth/logout',{method:'POST',headers:{cookie,Origin:origin}})).status,200);
  assert.equal((await fetch(origin+'/api/companies',{headers:{cookie}})).status,401);
  console.log('PASS: real HTTP auth, forged cookies, 14 pages, 9 APIs, invoice PDF, email draft, company SMTP and logout revocation');
} catch(error) {console.error(log);throw error;} finally {
  if(server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped;}
  assert.equal(path.dirname(path.resolve(temp)),path.resolve(tmpdir()));assert(path.basename(temp).startsWith('erp-smoke-'));rmSync(temp,{recursive:true,force:true});
}
