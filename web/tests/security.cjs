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
const realLoad = Module._load;
Module._load = function(name, parent, isMain) {
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
test('security regression suite', async t => {
  try {
    await t.test('scrypt, legacy migration compatibility and invalid passwords', async () => {
      const hash = await auth.hashPassword('correct-password');
      assert.equal(await auth.verifyPassword('correct-password', hash), true);
      assert.equal(await auth.verifyPassword('wrong', hash), false);
      assert.notEqual(hash, await auth.hashPassword('correct-password'));
      db.prepare("INSERT INTO User (id,email,name,passwordHash,role,createdAt) VALUES (1,'test@example.test','Test',?,'admin',datetime('now'))").run(hash);
    });
    await t.test('forged, expired and revoked sessions are rejected', () => {
      assert.equal(auth.verifySessionToken('anything'), null);
      const token = auth.createSessionToken({ id: 1 });
      assert.equal(auth.verifySessionToken(token).id, 1);
      db.prepare('UPDATE AuthSession SET expiresAt = 0').run();
      assert.equal(auth.verifySessionToken(token), null);
      const token2 = auth.createSessionToken({ id: 1 });
      auth.revokeSession(token2);
      assert.equal(auth.verifySessionToken(token2), null);
    });
    await t.test('every API handler rejects a forged session before touching input', async () => {
      jar.set('auth_session', 'forged');
      const scan = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? scan(path.join(dir, e.name)) : [path.join(dir,e.name)]);
      for (const file of scan(path.join(__dirname, '../src/app/api')).filter(p => p.endsWith('route.ts') && !p.includes(path.sep + 'auth' + path.sep))) {
        const handlers = require(file);
        for (const method of ['GET','POST','PUT','DELETE']) if (handlers[method]) {
          const response = await handlers[method](request(method), context(1));
          assert.equal(response.status, 401, file + ' ' + method);
        }
      }
    });
    jar.set('auth_session', auth.createSessionToken({ id: 1 }));
    jar.set('active_company_id', '1');
    await t.test('cross-company invoice updates/deletes preserve children and return 404', async () => {
      db.prepare("INSERT INTO Sale (id,companyId,number,saleDate,createdAt) VALUES (200,2,'B-1','2026-01-01',datetime('now'))").run();
      db.prepare("INSERT INTO SaleItem (saleId,itemName,quantity,price,priceWithVat,sumWithoutVat,sumWithVat) VALUES (200,'Protected',1,10,12.1,10,12.1)").run();
      const route = require('../src/app/api/invoices/[id]/route.ts');
      assert.equal((await route.PUT(request('PUT',{ number:'x',saleDate:'2026-01-01',items:[] }),context(200))).status,404);
      assert.equal((await route.DELETE(request('DELETE'),context(200))).status,404);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM SaleItem WHERE saleId=200').get().n,1);
    });
    await t.test('cross-origin mutations are rejected', async () => {
      const route = require('../src/app/api/companies/route.ts');
      const req = new Request('http://localhost:3000/api/companies', { method:'POST', headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'}, body:JSON.stringify({name:'No'}) });
      assert.equal((await route.POST(req)).status,403);
    });
    await t.test('fixed-point rounding and invalid numeric inputs', () => {
      const { calculateLine, totalLines } = require('../src/lib/money.ts');
      assert.equal(calculateLine({ quantity: 1, price: 1.005, vatRate: 0 }).lineNoVat, 1.01);
      assert.equal(calculateLine({ quantity: 3, price: 0.1, vatRate: 21 }).lineWithVat, 0.36);
      assert.deepEqual(totalLines([{quantity:1,price:0.1,vatRate:0},{quantity:1,price:0.2,vatRate:0}]),{sumWithoutVat:0.3,sumWithVat:0.3,vat:0});
      for(const quantity of [0,-1,NaN,Infinity,'abc',true,null]) if(quantity!==null) assert.throws(()=>calculateLine({quantity,price:1}));
      for(const vatRate of [-1,101,Infinity]) assert.throws(()=>calculateLine({quantity:1,price:1,vatRate}));
    });
    await t.test('sessions with an unknown role cannot access company data', async () => {
      // The database refuses unknown roles; a legacy row written before the trigger is still rejected by the API.
      assert.throws(()=>db.prepare("UPDATE User SET role='viewer' WHERE id=1").run(),/USER_ROLE_INVALID/);
      const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE name='user_role_UPDATE'").get().sql;
      db.exec('DROP TRIGGER user_role_UPDATE');
      db.prepare("UPDATE User SET role='viewer' WHERE id=1").run();
      const route=require('../src/app/api/companies/route.ts');
      assert.equal((await route.GET()).status,403);
      db.prepare("UPDATE User SET role='admin' WHERE id=1").run();
      db.exec(trigger);
    });
    await t.test('invoice and purchase lifecycle synchronizes ledger atomically', async () => {
      for(const [kind,type,key] of [['invoices','SALE','sale'],['purchases','PURCHASE','purchase']]){
        const route=require('../src/app/api/'+kind+'/route.ts');
        const detail=require('../src/app/api/'+kind+'/[id]/route.ts');
        const body={number:'T-'+kind,saleDate:'2026-01-02',purchaseDate:'2026-01-02',items:[{itemName:'Service',quantity:2,price:10,vatRate:21}]};
        const response=await route.POST(request('POST',body)); assert.equal(response.status,200);
        const doc=(await response.json())[key];
        const entries=()=>db.prepare('SELECT * FROM GeneralEntry WHERE sourceType=? AND sourceId=?').all(type,doc.id);
        assert.deepEqual(entries().map(e=>e.amount).sort((a,b)=>a-b),[4.2,20]);
        body.items[0].price=20;
        assert.equal((await detail.PUT(request('PUT',body),context(doc.id))).status,200);
        assert.deepEqual(entries().map(e=>e.amount).sort((a,b)=>a-b),[8.4,40]);
        const before=JSON.stringify(entries());
        assert.equal((await detail.PUT(request('PUT',{...body,items:[{itemName:'Bad',quantity:0,price:1}]}),context(doc.id))).status,400);
        assert.equal(JSON.stringify(entries()),before);
        assert.equal((await detail.DELETE(request('DELETE'),context(doc.id))).status,200);
        assert.equal(entries().length,0);
      }
    });
    await t.test('bank and payroll lifecycle maintains journal entries', async () => {
      const bank=require('../src/app/api/bank/route.ts');const bankDetail=require('../src/app/api/bank/[id]/route.ts');
      let response=await bank.POST(request('POST',{date:'2026-01-01',sum:100}));assert.equal(response.status,200);const bankId=(await response.json()).transaction.id;
      assert.equal(db.prepare("SELECT debitAccount FROM GeneralEntry WHERE sourceType='BANK' AND sourceId=?").get(bankId).debitAccount,'2710');
      assert.equal((await bankDetail.PUT(request('PUT',{date:'2026-01-02',sum:-50}),context(bankId))).status,200);
      assert.equal(db.prepare("SELECT amount FROM GeneralEntry WHERE sourceType='BANK' AND sourceId=?").get(bankId).amount,50);
      assert.equal((await bankDetail.DELETE(request('DELETE'),context(bankId))).status,200);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='BANK' AND sourceId=?").get(bankId).n,0);
      const payroll=require('../src/app/api/payrolls/route.ts');const payrollDetail=require('../src/app/api/payrolls/[id]/route.ts');
      const body={year:2026,month:2,employees:[{employeeName:'Employee',grossSalary:1000,netSalary:700,gpm:200,sodraEmployee:100,sodraEmployer:20}]};
      response=await payroll.POST(request('POST',body));assert.equal(response.status,200);const id=(await response.json()).payroll.id;
      const rows=()=>db.prepare("SELECT * FROM GeneralEntry WHERE sourceType='PAYROLL' AND sourceId=?").all(id);
      assert.equal(rows().length,4);assert.equal(rows().reduce((sum,e)=>sum+e.amount,0),1020);assert.equal(rows()[0].date,'2026-02-28');
      body.month=3;assert.equal((await payrollDetail.PUT(request('PUT',body),context(id))).status,200);assert.equal(rows().length,4);assert.equal(rows()[0].date,'2026-03-31');
      assert.equal((await payrollDetail.DELETE(request('DELETE'),context(id))).status,200);assert.equal(rows().length,0);
    });
    await t.test('cross-company updates and deletes are rejected in every scoped endpoint', async () => {
      db.prepare("INSERT INTO Purchase(id,companyId,number,purchaseDate,createdAt) VALUES(300,2,'B','2026-01-01',datetime('now'))").run();
      db.prepare("INSERT INTO Payroll(id,companyId,year,month,sumWithVat,createdAt) VALUES(300,2,2026,1,0,datetime('now'))").run();
      db.prepare("INSERT INTO BankTransaction(id,companyId,date,sum) VALUES(300,2,'2026-01-01',10)").run();
      db.prepare("INSERT INTO Client(id,companyId,name,createdAt,updatedAt) VALUES(300,2,'Other',datetime('now'),datetime('now'))").run();
      db.prepare("INSERT INTO StockItem(id,companyId,name,stock,remainder,price) VALUES(300,2,'Other',1,1,1)").run();
      db.prepare("INSERT INTO GeneralEntry(id,companyId,date,debitAccount,creditAccount,amount,sourceType) VALUES(9999,2,'2026-01-01','1','2',10,'MANUAL')").run();
      for(const kind of ['purchases','payrolls','bank','clients','stock','ledger']){
        const route=require('../src/app/api/'+kind+'/[id]/route.ts');const id=kind==='ledger'?9999:300;
        for(const method of ['PUT','DELETE']) assert.equal((await route[method](request(method,method==='PUT'?{}:undefined),context(id))).status,404,kind+' '+method);
      }
    });
    await t.test('foreign-company client and invalid dates are rejected', async () => {
      const route=require('../src/app/api/invoices/route.ts');const body={number:'Bad',saleDate:'2026-01-01',items:[{itemName:'Service',quantity:1,price:1}]};
      assert.equal((await route.POST(request('POST',{...body,clientId:300}))).status,400);
      assert.equal((await route.POST(request('POST',{...body,saleDate:'2026-02-30'}))).status,400);
      assert.equal((await route.POST(request('POST',{...body,items:[]}))).status,400);
    });
    await t.test('database transaction rolls back documents and generated postings together', () => {
      const before=db.prepare('SELECT COUNT(*) n FROM GeneralEntry').get().n;
      assert.throws(()=>db.transaction(()=>{db.prepare("INSERT INTO BankTransaction(companyId,date,sum) VALUES(1,'2026-01-01',15)").run();throw new Error('simulate failure');})());
      assert.equal(db.prepare('SELECT COUNT(*) n FROM GeneralEntry').get().n,before);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM BankTransaction WHERE companyId=1 AND sum=15").get().n,0);
      const { migrateAccounting }=require('../src/lib/accounting-schema.ts');migrateAccounting(db);migrateAccounting(db);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM GeneralEntry').get().n,before);
    });
    await t.test('legacy hash upgrades after login and login attempts are throttled', async () => {
      const crypto=require('node:crypto');const legacy='legacy:'+crypto.createHash('sha256').update('legacycorrect-password').digest('hex');
      db.prepare('UPDATE User SET passwordHash=? WHERE id=1').run(legacy);
      const login=require('../src/app/api/auth/login/route.ts');
      assert.equal((await login.POST(request('POST',{email:'test@example.test',password:'correct-password'}))).status,200);
      assert.match(db.prepare('SELECT passwordHash FROM User WHERE id=1').get().passwordHash,/^scrypt:/);
      for(let i=0;i<10;i++) assert.equal((await login.POST(request('POST',{email:'missing@example.test',password:'wrong'}))).status,401);
      assert.equal((await login.POST(request('POST',{email:'missing@example.test',password:'wrong'}))).status,429);
    });
    await t.test('import creates postings and rolls back partial inserts on duplicate external IDs', async () => {
      const route=require('../src/app/api/companies/import/route.ts');
      const payload={companyId:1,jsonData:{sales:[{id:700,number:'IMPORT',saleDate:'2026-01-01',sumWithoutVat:100,vat:21,sumWithVat:121}]}};
      assert.equal((await route.POST(request('POST',payload))).status,200);
      const sale=db.prepare('SELECT id FROM Sale WHERE externalId=700').get();
      assert.equal(db.prepare("SELECT SUM(amount) AS amount FROM GeneralEntry WHERE sourceType='SALE' AND sourceId=?").get(sale.id).amount,121);
      const before=db.prepare('SELECT COUNT(*) n FROM Client').get().n;
      payload.jsonData.clients=[{id:900,name:'Rollback client'}];
      assert.equal((await route.POST(request('POST',payload))).status,409);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM Client').get().n,before);
    });
    await t.test('generated ledger entries cannot be edited or deleted directly', async () => {
      const row=db.prepare("SELECT id FROM GeneralEntry WHERE sourceType='SALE' AND companyId=1 LIMIT 1").get();
      db.prepare("INSERT OR IGNORE INTO ChartOfAccount(code,name) VALUES ('2410','Receivable'),('5001','Revenue')").run();
      const route=require('../src/app/api/ledger/[id]/route.ts');
      assert.equal((await route.PUT(request('PUT',{date:'2026-01-01',debitAccount:'2410',creditAccount:'5001',amount:5}),context(row.id))).status,409);
      assert.equal((await route.DELETE(request('DELETE'),context(row.id))).status,409);
    });
    await t.test('login awaits password verification and logout revokes persisted token', async () => {
      const login = require('../src/app/api/auth/login/route.ts');
      assert.equal((await login.POST(request('POST',{email:'test@example.test',password:'wrong'}))).status,401);
      const response = await login.POST(request('POST',{email:'test@example.test',password:'correct-password'}));
      assert.equal(response.status,200);
      const token = response.headers.get('set-cookie').match(/auth_session=([^;]+)/)[1];
      jar.set('auth_session', token);
      const logout = require('../src/app/api/auth/logout/route.ts');
      assert.equal((await logout.POST(request('POST'))).status,200);
      assert.equal(auth.verifySessionToken(token),null);
    });
  } finally { db.close(); if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('erp-test-')) throw new Error('Unsafe cleanup path'); fs.rmSync(temp,{recursive:true,force:true}); }
});
