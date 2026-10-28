import pdfmake from 'pdfmake';
import path from 'node:path';
import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import type { InvoiceDocument, Party } from './invoice-document';
import { docTexts, formatDocNumber } from './doc-language';
const fontDir = path.join(process.cwd(), 'node_modules/pdfmake/fonts/Roboto');
pdfmake.addFonts({ Roboto: { normal:path.join(fontDir,'Roboto-Regular.ttf'), bold:path.join(fontDir,'Roboto-Medium.ttf'), italics:path.join(fontDir,'Roboto-Italic.ttf'), bolditalics:path.join(fontDir,'Roboto-MediumItalic.ttf') } });
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(file => path.resolve(file).startsWith(path.resolve(fontDir) + path.sep));
// All labels come from the document language (customer's language or the one chosen for this document); the font covers Latin, Lithuanian and Cyrillic.
export function invoiceDefinition(doc: InvoiceDocument): TDocumentDefinitions {
  const x = docTexts(doc.lang);
  const amount = (value: number) => formatDocNumber(doc.lang, value);
  const party = (title: string, p: Party, vat: boolean): Content => ({ stack: [ {text:title,bold:true,color:'#64748b',margin:[0,0,0,5]}, {text:p.name,bold:true,fontSize:12}, ...(p.code?[{text:x.companyCode+': '+p.code}]:[]), ...(vat && p.vatCode?[{text:x.vatCode+': '+p.vatCode}]:[]), ...(p.address?[{text:p.address}]:[]) ] });
  const headers = [x.colNo,x.colItem,x.colQty,doc.isVatPayer?x.colPriceNet:x.colPrice,...(doc.isVatPayer?[x.colVatPct]:[]),doc.isVatPayer?x.colSumVat:x.colSum];
  const rows: TableCell[][] = [headers.map(text=>({text,bold:true,color:'#ffffff',fillColor:'#1e293b',margin:[0,5,0,5]}))];
  doc.items.forEach((item,i)=>rows.push([String(i+1),item.itemName,{text:String(item.quantity),alignment:'right'},{text:formatDocNumber(doc.lang,item.price,2,6),alignment:'right'},...(doc.isVatPayer?[{text:String(item.vatRate ?? 0),alignment:'right' as const}]:[]),{text:amount(item.sumWithVat),alignment:'right'}]));
  const summary: Content[] = doc.isVatPayer
    ? [{text:x.sumNet+': '+amount(doc.net)+' '+doc.currency},{text:x.vat+': '+amount(doc.vat)+' '+doc.currency},...(doc.reverseCharge?[{text:doc.reverseCharge==='LT_96'?x.reverseChargeLt96:x.reverseChargeEu,fontSize:9,color:'#475569'}]:[])]
    : [{text:doc.vatMode==='SVS_LT'?x.noVatSvs:x.noVatSeller,fontSize:9,color:'#475569'}];
  return { pageSize:'A4',pageMargins:[40,42,40,48],defaultStyle:{font:'Roboto',fontSize:10,lineHeight:1.2},info:{title:doc.number,author:doc.seller.name},footer:(page,pages)=>({text:page+' / '+pages,alignment:'center',fontSize:8,color:'#64748b',margin:[0,15,0,0]}),content:[
    {text:(doc.correction?x.creditPrefix:'')+(doc.vatMode==='SVS_LT'?x.titleSvs:doc.isVatPayer?x.titleVat:x.titleNoVat),fontSize:20,bold:true,color:'#0f172a'},
    {text:x.number+' '+doc.number,margin:[0,6,0,4],fontSize:12,bold:true},
    {text:x.issueDate+': '+doc.date,margin:[0,0,0,doc.correction?4:22],color:'#475569'},
    ...(doc.correction?[{text:x.corrects+': '+doc.correction.originalNumber+' ('+doc.correction.originalDate+')'+(doc.correction.reason?'. '+x.reason+': '+doc.correction.reason:''),margin:[0,0,0,22] as [number,number,number,number],color:'#475569'}]:[]),
    {columns:[party(x.seller,doc.seller,doc.vatMode!=='NON_VAT'),party(x.buyer,doc.buyer,Boolean(doc.buyer.isVatPayer))],columnGap:30,margin:[0,0,0,22]},
    {text:x.currency+': '+doc.currency,fontSize:9,alignment:'right',margin:[0,0,0,6]},
    {table:{headerRows:1,widths:doc.isVatPayer?[22,'*',38,64,35,70]:[22,'*',42,72,78],body:rows},layout:'lightHorizontalLines'},
    {stack:[...summary,{text:x.total+': '+amount(doc.total)+' '+doc.currency,bold:true,fontSize:14,margin:[0,8,0,0]}],alignment:'right',margin:[0,18,0,20],unbreakable:true},
    {stack:[...(doc.dueDate?[{text:x.dueDate+': '+doc.dueDate,bold:true}]:[]),...(doc.seller.bankIban?[{text:x.iban+': '+doc.seller.bankIban}]:[]),...(doc.seller.bankName?[{text:x.bank+': '+doc.seller.bankName}]:[]),...(doc.seller.bankSwift?[{text:x.swift+': '+doc.seller.bankSwift}]:[])],unbreakable:true}
  ] };
}
export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> { return pdfmake.createPdf(invoiceDefinition(doc)).getBuffer(); }
