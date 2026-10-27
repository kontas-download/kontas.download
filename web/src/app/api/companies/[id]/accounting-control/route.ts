import { NextResponse } from 'next/server';
import { requireAdminApi, checkOrigin, currentUser } from '@/lib/access';
import { getDb } from '@/lib/db';
import { apiError, HttpError } from '@/lib/errors';
import { validTaxDate } from '@/lib/tax';
type Context={params:Promise<{id:string}>};
async function companyId(context:Context){const id=Number((await context.params).id);if(!Number.isSafeInteger(id)||!getDb().prepare('SELECT id FROM Company WHERE id=?').get(id))throw new HttpError(404,'Įmonė nerasta');return id;}
export async function GET(request:Request,context:Context){try{
 const denied=await requireAdminApi();if(denied)return denied;const id=await companyId(context);const db=getDb();
 const before=Number(new URL(request.url).searchParams.get('before')||Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(before)||before<1)throw new HttpError(400,'Neteisingas žymeklis');
 const lock=db.prepare('SELECT lockedThrough,reason FROM AccountingLock WHERE companyId=?').get(id)||{lockedThrough:null,reason:''};
 const events=db.prepare('SELECT id,entity,recordId,action,beforeJson,afterJson,actorId,createdAt FROM AccountingAudit WHERE companyId=? AND id<? ORDER BY id DESC LIMIT 100').all(id,before);
 return NextResponse.json({lock,events},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiError(error);}}
export async function PUT(request:Request,context:Context){try{
 const denied=await requireAdminApi();if(denied)return denied;const forbidden=await checkOrigin(request);if(forbidden)return forbidden;
 const id=await companyId(context);const body=await request.json();const date=body.lockedThrough||null;
 if((date!==null&&(!validTaxDate(date)||date<'1900-01-01'))||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)throw new HttpError(400,'Nurodykite teisingą datą ir uždaryto laikotarpio keitimo priežastį');
 const user=await currentUser();const db=getDb();
 db.transaction(()=>{const previous=db.prepare('SELECT lockedThrough,reason FROM AccountingLock WHERE companyId=?').get(id)||null;
 db.prepare('INSERT INTO AccountingLock VALUES(?,?,?) ON CONFLICT(companyId) DO UPDATE SET lockedThrough=excluded.lockedThrough,reason=excluded.reason').run(id,date,body.reason.trim());
 db.prepare("INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId) VALUES(?,'AccountingLock',?,'UPDATE',?,?,?)").run(id,id,JSON.stringify(previous),JSON.stringify({lockedThrough:date,reason:body.reason.trim()}),user?.id||null);
 }).immediate();return NextResponse.json({success:true});
 }catch(error){return apiError(error);}}
