import type Database from 'better-sqlite3';
import { getDb } from './db';
import { HttpError } from './errors';
export const taxModes = ['NON_VAT','STANDARD_VAT','SVS_LT'] as const;
export type TaxMode = typeof taxModes[number];
export function taxMode(value: unknown, legacyPayer: unknown = false): TaxMode {
  if(value == null)return legacyPayer ? 'STANDARD_VAT' : 'NON_VAT';
  if(!taxModes.includes(value as TaxMode))throw new HttpError(400,'Nežinomas mokesčių režimas');
  return value as TaxMode;
}
export function validTaxDate(value:unknown): value is string {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export function companyTaxMode(companyId:number,date?:string):TaxMode {
  const db=getDb();
  if(date && !validTaxDate(date))throw new HttpError(400,'Neteisinga mokesčių režimo data');
  if(date){const period=db.prepare('SELECT mode FROM CompanyTaxPeriod WHERE companyId=? AND effectiveFrom<=? ORDER BY effectiveFrom DESC LIMIT 1').get(companyId,date) as {mode:TaxMode}|undefined;if(period)return period.mode;}
  const company=db.prepare('SELECT taxMode,isVatPayer FROM Company WHERE id=?').get(companyId) as {taxMode:TaxMode|null;isVatPayer:number}|undefined;
  if(!company)throw new HttpError(404,'Įmonė nerasta');
  return taxMode(company.taxMode,company.isVatPayer);
}
export function purchaseTax(vat:number,mode:TaxMode,percent:unknown) {
  const deductionPercent=percent===undefined ? (mode==='STANDARD_VAT'?100:0) : percent;
  if(typeof deductionPercent!=='number'||!Number.isFinite(deductionPercent)||deductionPercent<0||deductionPercent>100||Math.abs(Math.round(deductionPercent*100)-deductionPercent*100)>0.000001)throw new HttpError(400,'PVM atskaitos dalis turi būti nuo 0 iki 100% (iki dviejų skaitmenų po kablelio)');
  if(mode!=='STANDARD_VAT' && deductionPercent!==0)throw new HttpError(400,'Be PVM ir taikant SVS įeinantis PVM neatskaitomas');
  const cents=Math.round(vat*100);
  const deductibleVat=Number((BigInt(cents)*BigInt(Math.round(deductionPercent*100))+5000n)/10000n)/100;
  return {deductionPercent,deductibleVat};
}
// Debit account of a purchase posting. Payable and VAT accounts are reserved for the generated entries.
export function purchaseDebitAccount(companyDb:Database.Database,value:unknown):string|null {
  if(value==null||value==='')return null;
  if(typeof value!=='string'||!/^\d{3,6}$/.test(value))throw new HttpError(400,'Neteisinga pirkimo apskaitos sąskaita');
  if(value.startsWith('44')||value==='2444'||value==='2410'||value.startsWith('27')||value.startsWith('5'))throw new HttpError(400,'Atsiskaitymų, PVM, pinigų ir pajamų sąskaitų negalima pasirinkti kaip sąnaudų sąskaitos');
  if(!companyDb.prepare('SELECT 1 FROM ChartOfAccount WHERE code=?').get(value))throw new HttpError(400,'Sąskaita nerasta sąskaitų plane');
  return value;
}
