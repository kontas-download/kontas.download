import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getDb } from './db';
import { HttpError } from './errors';
export interface MailSettings { companyId:number; host:string; port:number; secure:number; sender:string; username:string; passwordEncrypted:string; enabled:number; }
export function validEmail(value: unknown): value is string { return typeof value === 'string' && value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value); }
function key() {
  const value=process.env.SMTP_ENCRYPTION_KEY;
  if(!value || !/^[a-f0-9]{64}$/i.test(value)) throw new HttpError(503,'Norėdami išsaugoti SMTP, nustatykite serverio SMTP_ENCRYPTION_KEY (64 hex simboliai).');
  return Buffer.from(value,'hex');
}
function encrypt(password:string,companyId:number) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(Buffer.from(String(companyId)));
  const encrypted=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64')).join('.');
}
export function decryptPassword(settings:MailSettings) {
  if(!settings.passwordEncrypted)return '';
  try {const [iv,tag,data]=settings.passwordEncrypted.split('.').map(s=>Buffer.from(s,'base64'));const cipher=createDecipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(String(settings.companyId)));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');}
  catch {throw new HttpError(503,'Nepavyko nuskaityti įmonės SMTP slaptažodžio. Patikrinkite šifravimo raktą.');}
}
export function companyMail(companyId:number) {return getDb().prepare('SELECT * FROM CompanyMailSettings WHERE companyId=?').get(companyId) as MailSettings|undefined;}
export function publicMailSettings(companyId:number) {
  const settings=companyMail(companyId);
  if(!settings)return {host:'',port:587,secure:false,sender:'',username:'',enabled:false,hasPassword:false};
  return {host:settings.host,port:settings.port,secure:Boolean(settings.secure),sender:settings.sender,username:settings.username,enabled:Boolean(settings.enabled),hasPassword:Boolean(settings.passwordEncrypted)};
}
export function saveMailSettings(companyId:number,body:Record<string,unknown>) {
  const {host,port,secure,sender,username,password,enabled,clearPassword}=body;
  if(typeof host!=='string'||!host.trim()||host.length>253||/[\s/@?#]/.test(host)||!Number.isInteger(port)||Number(port)<1||Number(port)>65535||typeof secure!=='boolean'||!validEmail(sender)||typeof username!=='string'||username.length>254||/[\r\n]/.test(username)||typeof enabled!=='boolean'||(password!==undefined&&(typeof password!=='string'||password.length>4096))||(clearPassword!==undefined&&typeof clearPassword!=='boolean'))throw new HttpError(400,'Patikrinkite SMTP serverį, prievadą, adresą ir prisijungimo duomenis.');
  const previous=companyMail(companyId);
  const secret=clearPassword?'':typeof password==='string'&&password?encrypt(password,companyId):previous?.passwordEncrypted||'';
  if(enabled && Boolean(username)!==Boolean(secret))throw new HttpError(400,'Nurodykite SMTP naudotojo vardą ir slaptažodį kartu.');
  if(enabled && previous?.username!==undefined && previous.username!==username && secret && !password)throw new HttpError(400,'Keičiant naudotojo vardą įveskite naują slaptažodį.');
  getDb().prepare('INSERT INTO CompanyMailSettings(companyId,host,port,secure,sender,username,passwordEncrypted,enabled) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(companyId) DO UPDATE SET host=excluded.host,port=excluded.port,secure=excluded.secure,sender=excluded.sender,username=excluded.username,passwordEncrypted=excluded.passwordEncrypted,enabled=excluded.enabled').run(companyId,host.trim(),port,Number(secure),sender,username,secret,Number(enabled));
  return publicMailSettings(companyId);
}
