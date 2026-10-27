export interface VatRow { net:number; vat:number; gross:number; deductibleVat?:number|null; }
export function vatSummary(sales:VatRow[],purchases:VatRow[]) {
  const sum=(rows:VatRow[],field:'net'|'vat'|'gross')=>rows.reduce((n,r)=>n+Math.round(r[field]*100),0)/100;
  return {salesNet:sum(sales,'net'),salesVat:sum(sales,'vat'),purchaseVat:sum(purchases,'vat'),deductibleVat:purchases.reduce((n,p)=>n+Math.round((p.deductibleVat??0)*100),0)/100,unreviewedPurchases:purchases.filter(p=>p.vat!==0 && p.deductibleVat==null).length};
}
