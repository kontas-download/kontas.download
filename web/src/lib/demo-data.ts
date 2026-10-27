import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { calculateLine, totalLines } from './money';
import { allocatePayment, settleManually } from './payments';
import { parseTemplate } from './recurring';
import { todayVilnius } from './dates';

// Demonstration company with entirely fictional data. Everything is inserted with plain SQL inside one transaction, so the
// database triggers (ledger postings, document number, payment and credit-note guards, period locks, audit) apply exactly as
// for documents entered by hand. Only accounts of the public chart of accounts are posted: 2410, 272, 2710, 2444, 4430,
// 4480-4482, 4492, 5001, 6118 and 6304.
// The company is recognised as a demonstration company by its name only (DEMO_PREFIX); it is deleted like any other company.
// Codes are fictional: 9-digit company codes are chosen so that they fail the Lithuanian company code checksum, VAT codes
// consist of zeros (LT000000000000...), the IBAN has the check digits 00, e-mails use the reserved domain example.test.

export const DEMO_PREFIX = 'UAB „Demo pavyzdys“';
export const DEMO_LIMIT = 3;

// Rates and amounts of the fictional demo documents are fixed sample data, not legal parameters (not read from lib/rules).
type Rate = 0 | 9 | 21;
interface Line { item: keyof typeof ITEMS; quantity: number; price: number; rate: Rate }

const ITEMS = {
  consulting: { name: 'Konsultacijos', code: 'PSL-001' },
  maintenance: { name: 'Programinės įrangos priežiūra', code: 'PSL-002' },
  paper: { name: 'Biuro prekės: popierius A4', code: 'PR-001' },
  pens: { name: 'Biuro prekės: rašiklių rinkinys', code: 'PR-002' },
  cartridge: { name: 'Biuro prekės: spausdintuvo kasetė', code: 'PR-003' },
  book: { name: 'Mokomasis leidinys', code: 'PR-004' },
  rent: { name: 'Biuro patalpų nuoma', code: '' },
  internet: { name: 'Interneto ir ryšio paslaugos', code: '' },
  itService: { name: 'Kompiuterių priežiūros paslaugos', code: '' },
  books: { name: 'Mokomieji leidiniai', code: '' },
} as const;

// Every fictional text of the demonstration lives in this object (the test scans all of it). There are no phone numbers: any
// made-up number could belong to a real subscriber.
export const DEMO_DATA = {
  company: {
    code: '300000001', vatCode: 'LT000000000000', address: 'Pavyzdžio g. 1, Vilnius', email: 'info@example.test',
    bankName: 'Demonstracinis bankas', bankIban: 'LT00 0000 0000 0000 0000', bankSwift: 'DEMOLTXX',
  },
  clients: {
    buyer: { name: 'UAB „Pirkėjas Pavyzdys“', code: '300000002', vatCode: 'LT000000000001', email: 'pirkejas@example.test', address: 'Bandymų g. 2', city: 'Kaunas', country: 'Lietuva' },
    trade: { name: 'UAB „Bandomoji prekyba“', code: '300000004', vatCode: 'LT000000000002', email: 'prekyba@example.test', address: 'Pavyzdžio g. 3', city: 'Vilnius', country: 'Lietuva' },
    workshop: { name: 'MB „Pavyzdinė dirbtuvė“', code: '300000005', vatCode: '', email: 'dirbtuve@example.test', address: 'Bandymų g. 4', city: 'Klaipėda', country: 'Lietuva' },
    person: { name: 'Pirkėjas Fizinis Asmuo', code: '', vatCode: '', email: 'asmuo@example.test', address: 'Pavyzdžio g. 5', city: 'Šiauliai', country: 'Lietuva' },
    latvia: { name: 'SIA Demo Latvija', code: '', vatCode: 'LV00000000001', email: 'latvija@example.test', address: 'Parauga iela 1, Ryga', city: 'Ryga', country: 'Latvija' },
    supplier: { name: 'Tiekėjas Demo MB', code: '300000006', vatCode: 'LT000000000005', email: 'tiekejas@example.test', address: 'Tiekimo g. 6', city: 'Vilnius', country: 'Lietuva' },
    office: { name: 'UAB „Biuro prekių pavyzdys“', code: '300000007', vatCode: 'LT000000000006', email: 'biuras@example.test', address: 'Tiekimo g. 7', city: 'Kaunas', country: 'Lietuva' },
    landlord: { name: 'UAB „Nuomos pavyzdys“', code: '300000008', vatCode: 'LT000000000007', email: 'nuoma@example.test', address: 'Pavyzdžio g. 1', city: 'Vilnius', country: 'Lietuva' },
    publisher: { name: 'UAB „Leidinių pavyzdys“', code: '300000009', vatCode: 'LT000000000008', email: 'leidiniai@example.test', address: 'Bandymų g. 9', city: 'Panevėžys', country: 'Lietuva' },
  },
  items: ITEMS,
  stock: [
    { item: 'paper', warehouse: 'Pagrindinis', stock: 120, price: 4.5, cost: 3.2 },
    { item: 'pens', warehouse: 'Pagrindinis', stock: 40, price: 6.2, cost: 4.1 },
    { item: 'cartridge', warehouse: 'Pagrindinis', stock: 8, price: 35, cost: 26 },
    { item: 'book', warehouse: 'Pagrindinis', stock: 25, price: 20, cost: 12 },
  ],
  employees: [
    { name: 'Vardenis Pavardenis', code: 'DEMO-1', gross: 1500, gpm: 300, sodra: 292.5, employer: 26.55 },
    { name: 'Vardenė Pavardenė', code: 'DEMO-2', gross: 2000, gpm: 400, sodra: 390, employer: 35.4 },
  ],
  text: {
    warehouse: 'Pagrindinis',
    paid: 'Apmokėta',
    unpaid: 'Neapmokėta',
    saleNote: 'Demonstracinis dokumentas',
    creditReason: 'Suteikta mažiau konsultacijų valandų nei nurodyta sąskaitoje',
    euCodeNote: 'Paslaugos ES PVM mokėtojui: paslaugų teikimo vieta kitoje ES šalyje',
    bankAccount: 'Demonstracinė banko sąskaita',
    incoming: 'Apmokėjimas pagal sąskaitą',
    outgoing: 'Apmokėjimas tiekėjui pagal sąskaitą',
    cashNote: 'Grynieji kasoje',
    monthlyTemplate: 'Programinės įrangos priežiūra kas mėnesį',
    quarterlyTemplate: 'Ketvirtinės konsultacijos',
    templateNote: 'Sąskaita pagal paslaugų sutartį',
  },
} as const;

type ClientKey = keyof typeof DEMO_DATA.clients;
type Paid = 'full' | 'none' | 'cash' | { partial: number };
// Sales relative to today: daysAgo, customer, payment term, lines, how the invoice gets paid (and when, days after the invoice).
const SALES: { daysAgo: number; client: ClientKey; payDays: number; lines: Line[]; paid: Paid; paidAfter?: number }[] = [
  { daysAgo: 88, client: 'buyer', payDays: 14, lines: [{ item: 'consulting', quantity: 10, price: 45, rate: 21 }], paid: 'full', paidAfter: 6 },
  { daysAgo: 82, client: 'trade', payDays: 14, lines: [{ item: 'maintenance', quantity: 1, price: 250, rate: 21 }], paid: 'full', paidAfter: 10 },
  { daysAgo: 75, client: 'latvia', payDays: 30, lines: [{ item: 'consulting', quantity: 8, price: 50, rate: 0 }], paid: 'full', paidAfter: 20 },
  { daysAgo: 68, client: 'workshop', payDays: 14, lines: [{ item: 'paper', quantity: 20, price: 4.5, rate: 21 }], paid: 'none' },
  { daysAgo: 61, client: 'buyer', payDays: 14, lines: [{ item: 'book', quantity: 5, price: 20, rate: 9 }, { item: 'consulting', quantity: 2, price: 45, rate: 21 }], paid: 'full', paidAfter: 9 },
  { daysAgo: 54, client: 'person', payDays: 0, lines: [{ item: 'pens', quantity: 3, price: 6.2, rate: 21 }], paid: 'cash' },
  { daysAgo: 47, client: 'trade', payDays: 14, lines: [{ item: 'maintenance', quantity: 1, price: 250, rate: 21 }], paid: { partial: 150 }, paidAfter: 12 },
  { daysAgo: 40, client: 'buyer', payDays: 14, lines: [{ item: 'consulting', quantity: 12, price: 45, rate: 21 }], paid: 'none' },
  { daysAgo: 33, client: 'latvia', payDays: 30, lines: [{ item: 'consulting', quantity: 6, price: 50, rate: 0 }], paid: 'full', paidAfter: 15 },
  { daysAgo: 26, client: 'workshop', payDays: 30, lines: [{ item: 'cartridge', quantity: 2, price: 35, rate: 21 }], paid: 'none' },
  { daysAgo: 19, client: 'trade', payDays: 14, lines: [{ item: 'maintenance', quantity: 1, price: 250, rate: 21 }], paid: 'full', paidAfter: 7 },
  { daysAgo: 12, client: 'buyer', payDays: 14, lines: [{ item: 'consulting', quantity: 4, price: 45, rate: 21 }, { item: 'book', quantity: 2, price: 20, rate: 9 }], paid: 'none' },
  { daysAgo: 5, client: 'person', payDays: 7, lines: [{ item: 'book', quantity: 1, price: 20, rate: 9 }], paid: 'none' },
];
// Credit note: index of the corrected sale in SALES, days after it, returned lines (rates of the original only).
const CREDITS: { sale: number; after: number; lines: Line[] }[] = [
  { sale: 7, after: 4, lines: [{ item: 'consulting', quantity: 2, price: 45, rate: 21 }] },
];
const PURCHASES: { daysAgo: number; client: ClientKey; series: string; number: string; lines: Line[]; paidAfter?: number }[] = [
  { daysAgo: 86, client: 'office', series: 'BPP', number: '000101', lines: [{ item: 'paper', quantity: 50, price: 3.2, rate: 21 }, { item: 'pens', quantity: 20, price: 4.1, rate: 21 }], paidAfter: 5 },
  { daysAgo: 80, client: 'landlord', series: 'NP', number: '000201', lines: [{ item: 'rent', quantity: 1, price: 400, rate: 21 }], paidAfter: 3 },
  { daysAgo: 70, client: 'supplier', series: 'TD', number: '000301', lines: [{ item: 'internet', quantity: 1, price: 35, rate: 21 }], paidAfter: 4 },
  { daysAgo: 60, client: 'supplier', series: 'TD', number: '000302', lines: [{ item: 'itService', quantity: 1, price: 120, rate: 21 }], paidAfter: 6 },
  { daysAgo: 50, client: 'landlord', series: 'NP', number: '000202', lines: [{ item: 'rent', quantity: 1, price: 400, rate: 21 }], paidAfter: 3 },
  { daysAgo: 40, client: 'publisher', series: 'LP', number: '000401', lines: [{ item: 'books', quantity: 10, price: 12, rate: 9 }] },
  { daysAgo: 20, client: 'landlord', series: 'NP', number: '000203', lines: [{ item: 'rent', quantity: 1, price: 400, rate: 21 }] },
  { daysAgo: 15, client: 'office', series: 'BPP', number: '000102', lines: [{ item: 'cartridge', quantity: 4, price: 26, rate: 21 }] },
];

const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
const min = (a: string, b: string) => (a < b ? a : b);

// All strings of DEMO_DATA, for the fictional-data checks.
export function demoStrings(): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(DEMO_DATA);
  return out;
}

export function demoCompanyCount(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) n FROM Company WHERE substr(name,1,?)=?').get(DEMO_PREFIX.length, DEMO_PREFIX) as { n: number }).n;
}

// Name of the new company: the prefix, an optional label in parentheses, and " 2", " 3"... when the name is already taken.
function demoName(db: Database.Database, label: unknown): string {
  if (label != null && typeof label !== 'string') throw new HttpError(400, 'Neteisingas pavadinimas');
  const text = (label || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const base = !text ? DEMO_PREFIX : text.startsWith(DEMO_PREFIX) ? text : `${DEMO_PREFIX} (${text})`;
  const taken = (name: string) => Boolean(db.prepare('SELECT 1 FROM Company WHERE name=?').get(name));
  if (!taken(base)) return base;
  for (let n = 2; ; n++) if (!taken(`${base} ${n}`)) return `${base} ${n}`;
}

export function createDemoCompany(db: Database.Database, options: { name?: unknown; today?: string } = {}): { companyId: number; name: string } {
  const today = options.today ?? todayVilnius();
  const { company, clients, text } = DEMO_DATA;
  return db.transaction(() => {
    if (demoCompanyCount(db) >= DEMO_LIMIT) throw new HttpError(409, `Jau yra ${DEMO_LIMIT} demonstracinės įmonės. Ištrinkite nebereikalingą ir bandykite dar kartą.`);
    const name = demoName(db, options.name);
    const companyId = Number(db.prepare(`INSERT INTO Company(name,code,vatCode,address,email,phone,isVatPayer,taxMode,bankName,bankIban,bankSwift,currencyCode,isDefault,createdAt,updatedAt)
      VALUES(?,?,?,?,?,?,1,'STANDARD_VAT',?,?,?,'EUR',0,datetime('now'),datetime('now'))`)
      .run(name, company.code, company.vatCode, company.address, company.email, null, company.bankName, company.bankIban, company.bankSwift).lastInsertRowid);

    const clientIds = {} as Record<ClientKey, number>;
    const insertClient = db.prepare(`INSERT INTO Client(companyId,name,code,vatCode,isVatPayer,email,phone,address,city,countryName,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`);
    for (const [key, c] of Object.entries(clients) as [ClientKey, (typeof clients)[ClientKey]][]) {
      clientIds[key] = Number(insertClient.run(companyId, c.name, c.code || null, c.vatCode || null, c.vatCode ? 1 : 0, c.email, null, c.address, c.city, c.country).lastInsertRowid);
    }

    const insertStock = db.prepare('INSERT INTO StockItem(companyId,name,code,warehouseName,stock,remainder,price,cost,purchaseDate,clientName) VALUES(?,?,?,?,?,?,?,?,?,?)');
    for (const s of DEMO_DATA.stock) insertStock.run(companyId, ITEMS[s.item].name, ITEMS[s.item].code, s.warehouse, s.stock, s.stock, s.price, s.cost, addDays(today, -86), clients.office.name);

    const lineInput = (l: Line) => ({ itemName: ITEMS[l.item].name, itemCode: ITEMS[l.item].code, quantity: l.quantity, price: l.price, vatRate: l.rate });
    const insertSale = db.prepare(`INSERT INTO Sale(companyId,series,number,saleDate,payUntil,statusName,warehouseName,clientId,clientName,clientCode,clientVatCode,sumWithoutVat,vat,sumWithVat,currencyCode,notes,sellerIsVatPayer,sellerVatMode,docType,originalSaleId,correctionReason,createdAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'EUR',?,1,'STANDARD_VAT',?,?,?,datetime('now'))`);
    const insertSaleItem = db.prepare('INSERT INTO SaleItem(saleId,itemName,itemCode,quantity,price,priceWithVat,vatRate,sumWithoutVat,sumWithVat,warehouseName) VALUES(?,?,?,?,?,?,?,?,?,?)');
    const insertBank = db.prepare('INSERT INTO BankTransaction(companyId,date,number,clientName,clientCode,sum,correspondenceAccountCode,accountingBankInternalName,notes) VALUES(?,?,?,?,?,?,?,?,?)');
    let bankNumber = 0;
    const bank = (date: string, party: (typeof clients)[ClientKey], sum: number, notes: string) =>
      Number(insertBank.run(companyId, date, 'B-' + String(++bankNumber).padStart(4, '0'), party.name, party.code || null, sum, '2710', text.bankAccount, notes).lastInsertRowid);

    const saleIds: number[] = [];
    const saleLabels: string[] = [];
    SALES.forEach((s, index) => {
      const date = addDays(today, -s.daysAgo);
      const c = clients[s.client];
      const items = s.lines.map(lineInput);
      const totals = totalLines(items);
      const number = String(index + 1).padStart(6, '0');
      const status = s.paid === 'full' || s.paid === 'cash' ? text.paid : text.unpaid;
      const saleId = Number(insertSale.run(companyId, 'SF', number, date, addDays(date, s.payDays), status, text.warehouse, clientIds[s.client], c.name, c.code || null, c.vatCode || null,
        totals.sumWithoutVat, totals.vat, totals.sumWithVat, text.saleNote, 'SF', null, null).lastInsertRowid);
      items.forEach((item, i) => {
        const line = calculateLine(item);
        const itemId = Number(insertSaleItem.run(saleId, item.itemName, item.itemCode || null, line.qty, line.price, line.lineWithVat / line.qty, line.vatRate, line.lineNoVat, line.lineWithVat, text.warehouse).lastInsertRowid);
        // Services to a customer with an EU VAT code are not taxed in Lithuania: the accountant's i.SAF code PVM15.
        if (s.lines[i].rate === 0) db.prepare("INSERT INTO TaxLineCode(companyId,kind,itemId,taxCode,note,updatedAt) VALUES(?,'SALE',?,'PVM15',?,?)").run(companyId, itemId, text.euCodeNote, Date.now());
      });
      saleIds.push(saleId);
      saleLabels.push('SF ' + number);
    });

    CREDITS.forEach((k, index) => {
      const original = SALES[k.sale];
      const originalId = saleIds[k.sale];
      const date = min(addDays(today, -original.daysAgo + k.after), today);
      const c = clients[original.client];
      const items = k.lines.map(lineInput);
      const totals = totalLines(items);
      const saleId = Number(insertSale.run(companyId, 'KS', String(index + 1).padStart(6, '0'), date, null, 'Kreditinė', text.warehouse, clientIds[original.client], c.name, c.code || null, c.vatCode || null,
        -totals.sumWithoutVat, -totals.vat, -totals.sumWithVat, text.creditReason, 'KS', originalId, text.creditReason).lastInsertRowid);
      for (const item of items) {
        const line = calculateLine(item);
        insertSaleItem.run(saleId, item.itemName, item.itemCode || null, line.qty, line.price, line.lineWithVat / line.qty, line.vatRate, -line.lineNoVat, -line.lineWithVat, text.warehouse);
      }
    });

    const insertPurchase = db.prepare(`INSERT INTO Purchase(companyId,series,number,purchaseDate,clientId,clientName,clientCode,sumWithoutVat,vat,sumWithVat,currencyCode,notes,buyerVatMode,deductionPercent,deductibleVat,debitAccount,createdAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,'EUR',NULL,'STANDARD_VAT',100,?,NULL,datetime('now'))`);
    const insertPurchaseItem = db.prepare('INSERT INTO PurchaseItem(purchaseId,itemName,itemCode,quantity,price,sumWithoutVat,sumWithVat,vatRate) VALUES(?,?,?,?,?,?,?,?)');
    // Bank movements are created in date order after all documents exist, so the bank balance reads naturally.
    const movements: { date: string; run: () => void }[] = [];
    for (const p of PURCHASES) {
      const date = addDays(today, -p.daysAgo);
      const c = clients[p.client];
      const items = p.lines.map(lineInput);
      const totals = totalLines(items);
      const purchaseId = Number(insertPurchase.run(companyId, p.series, p.number, date, clientIds[p.client], c.name, c.code || null, totals.sumWithoutVat, totals.vat, totals.sumWithVat, totals.vat).lastInsertRowid);
      for (const item of items) {
        const line = calculateLine(item);
        insertPurchaseItem.run(purchaseId, item.itemName, item.itemCode || null, line.qty, line.price, line.lineNoVat, line.lineWithVat, line.vatRate);
      }
      if (p.paidAfter !== undefined) {
        const payDate = min(addDays(date, p.paidAfter), today);
        movements.push({ date: payDate, run: () => {
          const id = bank(payDate, c, -totals.sumWithVat, `${text.outgoing} ${p.series} ${p.number}`);
          allocatePayment(db, companyId, { bankTransactionId: id, kind: 'PURCHASE', documentId: purchaseId, amount: totals.sumWithVat });
        } });
      }
    }

    SALES.forEach((s, index) => {
      const saleId = saleIds[index];
      const c = clients[s.client];
      const gross = totalLines(s.lines.map(lineInput)).sumWithVat;
      const payDate = min(addDays(today, -s.daysAgo + (s.paidAfter ?? 0)), today);
      if (s.paid === 'cash') {
        movements.push({ date: payDate, run: () => { settleManually(db, companyId, { kind: 'SALE', documentId: saleId, method: 'CASH', date: payDate, note: text.cashNote }); } });
      } else if (s.paid !== 'none') {
        const amount = s.paid === 'full' ? gross : s.paid.partial;
        movements.push({ date: payDate, run: () => {
          const id = bank(payDate, c, amount, `${text.incoming} ${saleLabels[index]}`);
          allocatePayment(db, companyId, { bankTransactionId: id, kind: 'SALE', documentId: saleId, amount });
        } });
      }
    });
    // A receipt that is still waiting to be linked: the reconciliation screen suggests the matching invoice.
    const waiting = SALES.length - 2;
    const waitingDate = min(addDays(today, -SALES[waiting].daysAgo + 10), today);
    movements.push({ date: waitingDate, run: () => { bank(waitingDate, clients[SALES[waiting].client], totalLines(SALES[waiting].lines.map(lineInput)).sumWithVat, `${text.incoming} ${saleLabels[waiting]}`); } });
    movements.sort((a, b) => a.date.localeCompare(b.date)).forEach(m => m.run());

    // Payroll of the previous calendar month (posted on its last day, which is already in the past).
    const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
    const [payYear, payMonth] = month === 1 ? [year - 1, 12] : [year, month - 1];
    const employees = DEMO_DATA.employees.map(e => ({ ...e, net: Math.round((e.gross - e.gpm - e.sodra) * 100) / 100 }));
    const payrollId = Number(db.prepare("INSERT INTO Payroll(companyId,year,month,sumWithVat,createdAt) VALUES(?,?,?,?,datetime('now'))").run(companyId, payYear, payMonth, employees.reduce((n, e) => n + e.gross, 0)).lastInsertRowid);
    const insertEmployee = db.prepare('INSERT INTO PayrollEmployee(payrollId,employeeName,employeeCode,grossSalary,netSalary,gpm,sodraEmployee,sodraEmployer) VALUES(?,?,?,?,?,?,?,?)');
    for (const e of employees) insertEmployee.run(payrollId, e.name, e.code, e.gross, e.net, e.gpm, e.sodra, e.employer);

    // Recurring templates, validated by the same parser as the recurring invoices API. The monthly one is due today.
    const insertTemplate = db.prepare('INSERT INTO RecurringInvoice(companyId,name,clientId,series,frequency,nextDate,anchorDay,endDate,payDays,notes,itemsJson,active,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?)');
    for (const body of [
      { name: text.monthlyTemplate, clientId: clientIds.trade, frequency: 'MONTH', nextDate: today, payDays: 14, series: 'SF', notes: text.templateNote, items: [lineInput({ item: 'maintenance', quantity: 1, price: 250, rate: 21 })] },
      { name: text.quarterlyTemplate, clientId: clientIds.buyer, frequency: 'QUARTER', nextDate: addDays(today, 20), payDays: 14, series: 'SF', notes: text.templateNote, items: [lineInput({ item: 'consulting', quantity: 5, price: 45, rate: 21 })] },
    ]) {
      const t = parseTemplate(db, companyId, body);
      insertTemplate.run(companyId, t.name, t.clientId, t.series, t.frequency, t.nextDate, t.anchorDay, t.endDate, t.payDays, t.notes, JSON.stringify(t.items), Date.now());
    }
    return { companyId, name };
  }).immediate();
}
